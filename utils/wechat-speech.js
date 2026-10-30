const activation = require('./wechat-voice-plugin')
const WECHAT_SI_PROVIDER = 'wx069ba97219f66d99'
const VOICE_MAX_DURATION_MS = 30000
const VOICE_MAX_TEXT_LENGTH = 2000
const leases = new WeakMap()
const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/

function configuredManager(options = {}) {
  const declaration = options.manifest ? options.manifest.plugins && options.manifest.plugins.WechatSI
    : activation.configured ? activation : null
  if (!declaration || declaration.provider !== WECHAT_SI_PROVIDER || !VERSION.test(declaration.version || '')) return null
  const load = options.loadPlugin || activation.loadPlugin
  if (typeof load !== 'function') return null
  try {
    const plugin = load()
    const manager = plugin && typeof plugin.getRecordRecognitionManager === 'function' && plugin.getRecordRecognitionManager()
    return manager && typeof manager.start === 'function' && typeof manager.stop === 'function' ? manager : null
  } catch (_) { return null }
}

function getWechatVoiceCapability(options = {}) {
  const manager = configuredManager(options)
  const lease = manager && leases.get(manager)
  return { enabled: !!manager && !(lease && lease.poisoned), maxDurationMs: VOICE_MAX_DURATION_MS, maxTextLength: VOICE_MAX_TEXT_LENGTH }
}

function bounded(value, maximum) {
  return Number.isFinite(value) && value >= 1 ? Math.min(Math.floor(value), maximum) : maximum
}

/** Official WechatSI singleton. Never opens a recorder/socket or obtains a cloud ticket. */
class WechatSpeech {
  constructor(options) {
    this.options = options
    this.platform = options.wx || (typeof wx === 'undefined' ? {} : wx)
    this.partial = ''
    this.timers = {}
    this.closed = false
    this.started = false
    this.terminal = false
    this.stopRequested = false
  }
  timer(name, ms, callback) { clearTimeout(this.timers[name]); this.timers[name] = setTimeout(callback, ms) }
  clearTimers() { Object.values(this.timers).forEach(clearTimeout); this.timers = {} }
  owns() { return this.manager && leases.get(this.manager).owner === this }
  phase(value) { if (!this.closed && this.options.onPhase) this.options.onPhase(value) }
  cleanAudio(event) {
    const path = event && event.tempFilePath
    // Only plugin-returned WeChat temporary paths; never saved/user/remote paths.
    if (typeof path !== 'string' || !/^(?:wxfile:\/\/tmp(?:_|\/)|http:\/\/tmp\/)[A-Za-z0-9_./-]+$/.test(path)
      || path.split('/').includes('..') || typeof this.platform.getFileSystemManager !== 'function') return
    try { this.platform.getFileSystemManager().unlink({ filePath: path, fail() {} }) } catch (_) {}
  }
  release() {
    if (!this.owns()) return
    leases.get(this.manager).owner = null
    this.clearTimers()
  }
  drain() {
    if (!this.owns() || this.terminal) return
    // A missing native terminal event cannot be correlated to a later recording.
    // Quarantine that manager until a fresh app runtime instead of guessing.
    this.timer('drain', 10000, () => {
      if (this.owns() && !this.terminal) {
        const lease = leases.get(this.manager)
        lease.poisoned = true; lease.owner = null; this.clearTimers()
      }
    })
  }
  requestStop() {
    if (!this.owns() || this.terminal || this.stopRequested) return
    this.stopRequested = true
    try { this.manager.stop() } catch (_) { this.fail('VOICE_STOP_FAILED') }
  }
  async start() {
    if (this.closed || this.manager) return
    const manager = configuredManager(this.options)
    if (!manager) return this.fail('VOICE_PLUGIN_UNAVAILABLE')
    let lease = leases.get(manager)
    if (!lease) { lease = { owner: null, poisoned: false }; leases.set(manager, lease) }
    if (lease.poisoned) return this.fail('VOICE_PLUGIN_RESET_REQUIRED')
    if (lease.owner) return this.fail('VOICE_RECORDER_BUSY')
    this.manager = manager; lease.owner = this
    manager.onStart = () => {
      if (!this.owns()) return
      if (this.closed) { this.stopRequested = false; this.requestStop(); return }
      if (this.started) return
      this.started = true; clearTimeout(this.timers.connect)
      this.phase('recording')
      this.timer('duration', bounded(this.options.maxDurationMs, VOICE_MAX_DURATION_MS), () => this.stop())
    }
    manager.onRecognize = event => {
      if (!this.owns() || this.closed || !this.started) return
      this.recognize(event)
    }
    manager.onStop = event => {
      this.cleanAudio(event)
      if (!this.owns() || this.terminal) return
      if (!this.started && !this.closed) return
      this.terminal = true
      if (this.closed) { this.release(); return }
      this.recognize(event)
      if (this.closed) { this.release(); return }
      this.closed = true; this.release()
      if (this.options.onComplete) this.options.onComplete(this.partial)
    }
    manager.onError = () => { if (this.owns() && !this.closed) this.fail('VOICE_RECOGNITION_FAILED') }
    this.phase('connecting')
    this.timer('connect', 10000, () => this.fail('VOICE_START_TIMEOUT'))
    try { manager.start({ duration: bounded(this.options.maxDurationMs, VOICE_MAX_DURATION_MS), lang: 'zh_CN' }) }
    catch (_) { this.fail('VOICE_START_FAILED') }
  }
  recognize(event) {
    if (!event || typeof event.result !== 'string') { this.fail('VOICE_BAD_RESPONSE'); return }
    const maximum = bounded(this.options.maxTextLength, VOICE_MAX_TEXT_LENGTH)
    this.partial = event.result.slice(0, maximum)
    if (this.options.onText) this.options.onText(this.partial)
    if (event.result.length > maximum) this.fail('VOICE_TEXT_LIMIT')
  }
  stop() {
    if (this.closed || !this.owns() || this.stopRequested) return
    clearTimeout(this.timers.connect); clearTimeout(this.timers.duration)
    this.phase('processing')
    this.timer('final', 10000, () => this.fail('VOICE_FINAL_TIMEOUT'))
    this.requestStop()
  }
  cancel() {
    if (this.closed) return
    this.closed = true; this.clearTimers(); this.drain(); this.requestStop()
  }
  fail(code) {
    if (this.closed) return
    this.closed = true; this.clearTimers(); this.drain(); this.requestStop()
    if (this.options.onError) this.options.onError(code, this.partial)
  }
}
module.exports = { WechatSpeech, getWechatVoiceCapability, WECHAT_SI_PROVIDER, VOICE_MAX_DURATION_MS, VOICE_MAX_TEXT_LENGTH }
