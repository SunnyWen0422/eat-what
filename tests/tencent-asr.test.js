const test = require('node:test')
const assert = require('node:assert/strict')
const { RealtimeSpeech } = require('../utils/tencent-asr')

function nativeFixture(t, extra = {}) {
  const oldWx = global.wx
  const f = { recorderHandlers: {}, sent: [], phases: [], text: [], errors: [], complete: [], deleted: [], starts: [], stops: 0 }
  const recorder = {
    start(options) { f.starts.push(options); f.recorderHandlers.Start() },
    stop() { f.stops++; f.recorderHandlers.Stop({ tempFilePath: '/tmp/voice.mp3' }) }
  }
  for (const name of ['Start', 'FrameRecorded', 'Stop', 'Error', 'InterruptionBegin']) {
    recorder['on' + name] = handler => { f.recorderHandlers[name] = handler }
    recorder['off' + name] = handler => { if (f.recorderHandlers[name] === handler) delete f.recorderHandlers[name] }
  }
  f.socket = {
    onError(handler) { this.error = handler }, onClose(handler) { this.closed = handler }, onMessage(handler) { this.message = handler },
    send(request) { f.sent.push(request.data); if (request.success) request.success() }, close() { this.closed() }
  }
  global.wx = { getRecorderManager: () => recorder, connectSocket: () => f.socket,
    getFileSystemManager: () => ({ unlink: request => f.deleted.push(request.filePath) }) }
  f.speech = new RealtimeSpeech({
    getTicket: async () => ({ url: 'wss://asr.cloud.tencent.com/asr/v2/1234567890?signature=fixture', voiceId: 'fixture', expiresAt: Date.now() + 60000 }),
    maxTextLength: 2000, onPhase: value => f.phases.push(value), onText: value => f.text.push(value),
    onError: (code, text) => f.errors.push({ code, text }), onComplete: value => f.complete.push(value), ...extra
  })
  f.message = body => f.socket.message({ data: JSON.stringify({ code: 0, voice_id: 'fixture', ...body }) })
  t.after(() => { f.speech.cancel(); global.wx = oldWx })
  return f
}

test('native audio is paced; stop waits for the last frame before sending end and removes its temporary file', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = nativeFixture(t)
  await f.speech.start(); f.message({})
  assert.equal(f.starts[0].duration, 30000)
  f.recorderHandlers.FrameRecorded({ frameBuffer: new ArrayBuffer(6), isLastFrame: false })
  f.recorderHandlers.FrameRecorded({ frameBuffer: new ArrayBuffer(6), isLastFrame: false })
  assert.equal(f.sent.length, 1)
  f.speech.stop(); assert.equal(f.stops, 1); assert.equal(f.sent.length, 1)
  assert.deepEqual(f.deleted, ['/tmp/voice.mp3'])
  f.recorderHandlers.FrameRecorded({ frameBuffer: new ArrayBuffer(6), isLastFrame: true })
  t.mock.timers.tick(1); assert.equal(f.sent.length, 2)
  t.mock.timers.tick(1); assert.equal(f.sent.length, 3)
  t.mock.timers.tick(1); assert.equal(f.sent[3], '{"type":"end"}')
  f.message({ result: { index: 1, slice_type: 2, voice_text_str: '少盐' } })
  f.message({ result: { index: 0, slice_type: 2, voice_text_str: '清淡，' } })
  f.message({ final: 1 })
  assert.deepEqual(f.complete, ['清淡，少盐']); assert.deepEqual(f.errors, [])
  assert.deepEqual(Object.keys(f.recorderHandlers), [])
})

test('cancel before ticket resolution prevents native recording and frees recorder ownership', async t => {
  let resolveTicket
  const f = nativeFixture(t, { getTicket: () => new Promise(resolve => { resolveTicket = resolve }) })
  const pending = f.speech.start(); f.speech.cancel()
  resolveTicket({ url: 'wss://asr.cloud.tencent.com/asr/v2/1234567890?signature=fixture', voiceId: 'fixture', expiresAt: Date.now() + 60000 })
  await pending
  assert.equal(f.starts.length, 0)
  const other = new RealtimeSpeech({ getTicket: async () => { throw Error('fixture') }, onError: code => f.errors.push(code) })
  await other.start(); assert.deepEqual(f.errors, ['VOICE_START_FAILED'])
})

test('duration limit stops native microphone and missing final response terminates with partial text', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = nativeFixture(t)
  await f.speech.start(); f.message({})
  f.message({ result: { index: 0, slice_type: 1, voice_text_str: '保留文字' } })
  // Keep audio frames flowing until the recording cap rather than triggering the silence watchdog.
  for (let i = 0; i < 30; i++) {
    f.recorderHandlers.FrameRecorded({ frameBuffer: new ArrayBuffer(6), isLastFrame: false })
    t.mock.timers.tick(1000)
  }
  assert.equal(f.stops, 1)
  t.mock.timers.tick(10000)
  assert.deepEqual(f.errors, [{ code: 'VOICE_FINAL_TIMEOUT', text: '保留文字' }])
  assert.deepEqual(Object.keys(f.recorderHandlers), [])
})

test('text limit failure retains partial recognition and releases native resources', async t => {
  const f = nativeFixture(t, { maxTextLength: 2 })
  await f.speech.start(); f.message({})
  f.message({ result: { index: 0, slice_type: 2, voice_text_str: '清淡' } })
  f.message({ result: { index: 1, slice_type: 1, voice_text_str: '更多' } })
  assert.deepEqual(f.errors, [{ code: 'VOICE_TEXT_LIMIT', text: '清淡' }])
  assert.equal(f.stops, 1); assert.deepEqual(f.deleted, ['/tmp/voice.mp3'])
})

test('slow socket queue is bounded and reports its recognized text', async t => {
  const f = nativeFixture(t)
  await f.speech.start(); f.message({})
  f.message({ result: { index: 0, slice_type: 2, voice_text_str: '已经识别' } })
  f.socket.send = request => f.sent.push(request.data) // Native socket never acknowledges the first frame.
  f.recorderHandlers.FrameRecorded({ frameBuffer: new ArrayBuffer(6), isLastFrame: false })
  f.recorderHandlers.FrameRecorded({ frameBuffer: new ArrayBuffer(32001), isLastFrame: false })
  assert.deepEqual(f.errors, [{ code: 'VOICE_SLOW_CONNECTION', text: '已经识别' }])
  assert.equal(f.speech.queue.length, 0); assert.equal(f.stops, 1)
})

test('expired sessions cannot open the native microphone or socket', async t => {
  const f = nativeFixture(t, { getTicket: async () => ({ url: 'wss://asr.cloud.tencent.com/asr/v2/1234567890?signature=fixture', voiceId: 'fixture', expiresAt: Date.now() - 1 }) })
  await f.speech.start()
  assert.deepEqual(f.errors, [{ code: 'VOICE_INVALID_SESSION', text: '' }]); assert.equal(f.starts.length, 0)
  assert.equal(f.speech.socket, undefined)
})

test('session identity mismatch blocks transcription and fails closed', async t => {
  const f = nativeFixture(t)
  await f.speech.start(); f.message({})
  f.message({ voice_id: 'other-user', result: { index: 0, slice_type: 1, voice_text_str: '不应显示' } })
  assert.deepEqual(f.text, []); assert.deepEqual(f.errors, [{ code: 'VOICE_SESSION_MISMATCH', text: '' }])
})
