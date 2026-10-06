// Realtime WebSocket protocol. No credentials, audio or transcripts are persisted.
let recorderOwner = null
const RECORD_OPTIONS = { duration: 30000, sampleRate: 16000, numberOfChannels: 1, encodeBitRate: 48000, format: 'mp3', frameSize: 1 }

class RealtimeSpeech {
  constructor(options) {
    this.options = options
    this.parts = new Map()
    this.queue = []
    this.timers = {}
    this.closed = false
    this.started = false
    this.stopped = false
    this.sending = false
    this.lastFrame = false
    this.bytes = 0
  }
  timer(key, ms, fn) {
    clearTimeout(this.timers[key])
    this.timers[key] = setTimeout(fn, ms)
  }
  text() { return [...this.parts.entries()].sort((a, b) => a[0] - b[0]).map(pair => pair[1].text).join('') }
  async start() {
    if (recorderOwner) return this.fail('VOICE_RECORDER_BUSY')
    recorderOwner = this
    this.timer('connect', 10000, () => this.fail('VOICE_CONNECT_TIMEOUT'))
    try {
      const ticket = await this.options.getTicket()
      if (this.closed) return
      if (!ticket || !/^wss:\/\/asr\.cloud\.tencent\.com\/asr\/v2\/[0-9]+\?/.test(ticket.url || '')
          || !ticket.voiceId || !Number.isFinite(ticket.expiresAt) || ticket.expiresAt <= Date.now())
        return this.fail('VOICE_INVALID_SESSION')
      this.voiceId = ticket.voiceId
      this.recorder = wx.getRecorderManager()
      this.handlers = {
        Start: () => {
          if (this.closed) { this.stopRequested = false; this.requestRecorderStop(); return }
          this.options.onPhase('recording')
          this.timer('duration', 30000, () => this.stop())
          this.timer('frames', 5000, () => this.fail('VOICE_AUDIO_TIMEOUT'))
        },
        FrameRecorded: event => {
          if (this.closed) return
          clearTimeout(this.timers.frames)
          const frame = event.frameBuffer
          if (frame && frame.byteLength) {
            this.bytes += frame.byteLength
            this.queue.push(frame)
            if (this.bytes > 32000) return this.fail('VOICE_SLOW_CONNECTION')
          }
          if (event.isLastFrame) this.lastFrame = true
          if (!this.lastFrame) this.timer('frames', 5000, () => this.fail('VOICE_AUDIO_TIMEOUT'))
          this.pump()
        },
        Stop: event => {
          this.stopped = true
          // Temp recording is not retained by this feature.
          if (event && event.tempFilePath && typeof wx.getFileSystemManager === 'function') {
            try { wx.getFileSystemManager().unlink({ filePath: event.tempFilePath, fail() {} }) } catch (_) {}
          }
          if (this.closed) { this.detachRecorder(); return }
          clearTimeout(this.timers.duration)
          clearTimeout(this.timers.frames)
          this.options.onPhase('processing')
          this.timer('final', 10000, () => this.fail('VOICE_FINAL_TIMEOUT'))
          // Wait for isLastFrame even if native onStop arrives first.
          this.pump()
        },
        Error: () => { this.stopped = true; if (this.closed) this.detachRecorder(); else this.fail('VOICE_RECORD_FAILED') },
        InterruptionBegin: () => this.fail('VOICE_RECORD_INTERRUPTED')
      }
      for (const [name, handler] of Object.entries(this.handlers)) {
        if (typeof this.recorder['on' + name] === 'function') this.recorder['on' + name](handler)
      }
      this.socket = wx.connectSocket({ url: ticket.url, success() {}, fail: () => this.fail('VOICE_CONNECTION_FAILED') })
      this.socket.onError(() => this.fail('VOICE_CONNECTION_FAILED'))
      this.socket.onClose(() => { if (!this.closed) this.fail('VOICE_CONNECTION_CLOSED') })
      this.socket.onMessage(event => this.message(event))
    } catch (error) {
      const data = error && error.data || {}
      const code = data.error_code || data.errorCode || 'VOICE_START_FAILED'
      this.diagnosticId = data.diagnostic_id
      this.fail(/^VOICE_[A-Z_]+$/.test(code) ? code : 'VOICE_START_FAILED')
    }
  }
  message(event) {
    if (this.closed) return
    let data
    try { data = JSON.parse(event.data) } catch (_) { return this.fail('VOICE_BAD_RESPONSE') }
    if (!data || typeof data !== 'object') return this.fail('VOICE_BAD_RESPONSE')
    if (data.code !== 0) return this.fail(Number.isInteger(data.code) ? 'ASR_' + data.code : 'VOICE_BAD_RESPONSE')
    if (data.voice_id !== this.voiceId) return this.fail('VOICE_SESSION_MISMATCH')
    if (!this.started) {
      clearTimeout(this.timers.connect)
      this.started = true
      this.timer('frames', 5000, () => this.fail('VOICE_AUDIO_TIMEOUT'))
      try { this.recorder.start({ ...RECORD_OPTIONS }) } catch (_) { this.stopped = true; this.fail('VOICE_RECORD_FAILED') }
      return
    }
    const result = data.result
    if (result) {
      if (!Number.isInteger(result.index) || result.index < 0 || result.index > 500
          || ![0, 1, 2].includes(result.slice_type) || typeof result.voice_text_str !== 'string') return this.fail('VOICE_BAD_RESPONSE')
      const previous = this.parts.get(result.index)
      if (!previous || !previous.stable) this.parts.set(result.index, { text: result.voice_text_str, stable: result.slice_type === 2 })
      const text = this.text()
      if (text.length > this.options.maxTextLength) {
        if (previous) this.parts.set(result.index, previous)
        else this.parts.delete(result.index)
        return this.fail('VOICE_TEXT_LIMIT')
      }
      this.options.onText(text)
    }
    if (data.final === 1) { const text = this.text(); this.close(); this.options.onComplete(text) }
  }
  pump() {
    if (this.closed || this.sending || !this.socket) return
    if (!this.queue.length) {
      if (this.lastFrame && !this.endSent) {
        this.endSent = true
        this.options.onPhase('processing')
        this.timer('final', 10000, () => this.fail('VOICE_FINAL_TIMEOUT'))
        try { this.socket.send({ data: JSON.stringify({ type: 'end' }), fail: () => this.fail('VOICE_SEND_FAILED') }) }
        catch (_) { this.fail('VOICE_SEND_FAILED') }
      }
      return
    }
    const buffer = this.queue.shift()
    this.bytes -= buffer.byteLength
    this.sending = true
    // MP3 recorded at 48 kbps; never burst delayed audio faster than realtime.
    try {
      this.socket.send({ data: buffer, success: () => {
        if (this.closed) return
        this.timer('send', Math.ceil(buffer.byteLength / 6), () => { this.sending = false; this.pump() })
      }, fail: () => this.fail('VOICE_SEND_FAILED') })
    } catch (_) { this.fail('VOICE_SEND_FAILED') }
  }
  requestRecorderStop() {
    if (!this.recorder || !this.started || this.stopped || this.stopRequested) return
    this.stopRequested = true
    try { this.recorder.stop() } catch (_) { this.fail('VOICE_STOP_FAILED') }
  }
  stop() {
    if (this.closed || !this.started || this.stopRequested) return
    this.options.onPhase('processing')
    clearTimeout(this.timers.duration)
    this.timer('final', 10000, () => this.fail('VOICE_FINAL_TIMEOUT'))
    this.requestRecorderStop()
  }
  detachRecorder() {
    // Keep native stop/error callbacks until the microphone actually stops.
    if (this.started && !this.stopped) return
    if (this.recorder && this.handlers) for (const [name, handler] of Object.entries(this.handlers)) {
      if (typeof this.recorder['off' + name] === 'function') this.recorder['off' + name](handler)
    }
    if (recorderOwner === this) recorderOwner = null
  }
  close() {
    if (this.closed) return
    this.closed = true
    Object.values(this.timers).forEach(clearTimeout)
    this.queue = []
    this.requestRecorderStop()
    this.detachRecorder()
    if (this.socket) { try { this.socket.close({ code: 1000 }) } catch (_) {} }
  }
  cancel() { this.close() }
  fail(code) {
    if (this.closed) return
    const text = this.text()
    this.close()
    this.options.onError(code, text, this.diagnosticId || this.voiceId)
  }
}
module.exports = { RealtimeSpeech, RECORD_OPTIONS }
