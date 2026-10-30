const test = require('node:test')
const assert = require('node:assert/strict')
const { WechatSpeech, getWechatVoiceCapability } = require('../utils/wechat-speech')

function fixture(t) {
  const f = { starts: [], stops: 0, phases: [], text: [], errors: [], complete: [], removed: [] }
  f.manager = { start: options => f.starts.push(options), stop: () => { f.stops++ } }
  f.manifest = { plugins: { WechatSI: { provider: 'wx069ba97219f66d99', version: '1.2.3' } } }
  f.make = () => new WechatSpeech({
    manifest: f.manifest, loadPlugin: () => ({ getRecordRecognitionManager: () => f.manager }),
    wx: { getFileSystemManager: () => ({ unlink: request => f.removed.push(request.filePath) }) },
    maxDurationMs: 30000, maxTextLength: 2000, onPhase: value => f.phases.push(value),
    onText: value => f.text.push(value), onError: (code, text) => f.errors.push({ code, text }), onComplete: value => f.complete.push(value)
  })
  f.speech = f.make(); t.after(() => { f.speech.cancel(); if (f.manager.onStop) f.manager.onStop({ result: '' }) })
  return f
}

test('capability stays unavailable without an explicit manifest and never loads an undeclared plugin', () => {
  let loads = 0
  const loadPlugin = () => { loads++; throw Error('undeclared') }
  for (const manifest of [{}, { plugins: { WechatSI: { provider: 'wrong', version: '1.2.3' } } }, { plugins: { WechatSI: { provider: 'wx069ba97219f66d99', version: 'latest' } } }]) {
    assert.equal(getWechatVoiceCapability({ manifest, loadPlugin }).enabled, false)
  }
  assert.equal(loads, 0)
  assert.equal(getWechatVoiceCapability().enabled, false)
})

test('capability validates the official plugin manager API and gracefully catches plugin loading errors', t => {
  const f = fixture(t)
  assert.deepEqual(getWechatVoiceCapability({ manifest: f.manifest, loadPlugin: () => ({ getRecordRecognitionManager: () => f.manager }) }),
    { enabled: true, maxDurationMs: 30000, maxTextLength: 2000 })
  for (const loadPlugin of [() => { throw Error('not authorized') }, () => ({}), () => ({ getRecordRecognitionManager: () => ({ start() {} }) })]) {
    assert.equal(getWechatVoiceCapability({ manifest: f.manifest, loadPlugin }).enabled, false)
  }
})

test('official manager starts Chinese recognition, emits editable text and finalizes stop without cloud tickets', async t => {
  const f = fixture(t)
  await f.speech.start(); assert.deepEqual(f.starts, [{ duration: 30000, lang: 'zh_CN' }])
  f.manager.onStart(); assert.equal(f.phases.at(-1), 'recording')
  f.manager.onRecognize({ result: '不要花生' }); assert.deepEqual(f.text, ['不要花生'])
  f.speech.stop(); f.speech.stop(); assert.equal(f.stops, 1); assert.equal(f.phases.at(-1), 'processing')
  f.manager.onStop({ result: '不要花生和虾', tempFilePath: 'wxfile://tmp_voice.mp3' })
  assert.deepEqual(f.complete, ['不要花生和虾']); assert.deepEqual(f.removed, ['wxfile://tmp_voice.mp3']); assert.deepEqual(f.errors, [])
})

test('singleton cancellation drains old native callbacks before reuse; captured old callbacks cannot alter the new run', async t => {
  const f = fixture(t)
  await f.speech.start(); f.manager.onStart()
  const old = { text: f.manager.onRecognize, start: f.manager.onStart, stop: f.manager.onStop, error: f.manager.onError }
  f.speech.cancel()
  const blocked = f.make(); await blocked.start()
  assert.equal(f.starts.length, 1); assert.equal(f.errors.at(-1).code, 'VOICE_RECORDER_BUSY')
  old.text({ result: '旧识别' }); assert.deepEqual(f.text, [])
  old.stop({ result: '旧最终结果', tempFilePath: 'wxfile://tmp_old.mp3' })
  const fresh = f.make(); await fresh.start(); f.manager.onStart()
  old.text({ result: '更迟的旧识别' }); old.stop({ result: '更迟的旧结束' }); old.error({ retcode: -1 }); old.start()
  assert.deepEqual(f.text, []); assert.deepEqual(f.complete, [])
  f.manager.onRecognize({ result: '新识别' }); f.manager.onStop({ result: '新最终结果' })
  assert.deepEqual(f.text, ['新识别', '新最终结果']); assert.deepEqual(f.complete, ['新最终结果']); fresh.cancel()
})

test('30 second watchdog requests stop and final timeout preserves partial recognition', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture(t); await f.speech.start(); f.manager.onStart(); f.manager.onRecognize({ result: '少盐' })
  t.mock.timers.tick(30000); assert.equal(f.stops, 1)
  t.mock.timers.tick(10000); assert.deepEqual(f.errors, [{ code: 'VOICE_FINAL_TIMEOUT', text: '少盐' }])
  f.manager.onStop({ result: '迟到结果' }); assert.deepEqual(f.complete, [])
})

test('missing native terminal callback poisons that singleton so it cannot contaminate another recording', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const f = fixture(t); await f.speech.start(); f.manager.onStart(); f.speech.cancel()
  t.mock.timers.tick(10000)
  const fresh = f.make(); await fresh.start()
  assert.equal(f.starts.length, 1); assert.equal(f.errors.at(-1).code, 'VOICE_PLUGIN_RESET_REQUIRED')
  f.manager.onRecognize({ result: '迟到' }); assert.deepEqual(f.text, [])
})

test('native error preserves partial recognition and cancellation stops a delayed native start', async t => {
  const f = fixture(t); await f.speech.start(); f.manager.onStart(); f.manager.onRecognize({ result: '已识别' })
  f.manager.onError({ retcode: -1, msg: 'provider detail' })
  assert.deepEqual(f.errors, [{ code: 'VOICE_RECOGNITION_FAILED', text: '已识别' }])
  assert.equal(f.stops, 1)
  f.manager.onStop({ result: '' })
  const second = f.make(); await second.start(); second.cancel(); const stops = f.stops
  f.manager.onStart(); assert.equal(f.stops, stops + 1)
  f.manager.onStop({ result: '' }); second.cancel()
})

test('only plugin temporary file paths can be removed; private/saved/remote/traversal paths stay untouched', async t => {
  const f = fixture(t)
  for (const path of ['wxfile://usr/private.mp3', '/saved.mp3', 'https://example.com/audio.mp3', 'wxfile://tmp/../private.mp3']) {
    const speech = f.make(); await speech.start(); f.manager.onStart(); f.manager.onStop({ result: '', tempFilePath: path })
  }
  assert.deepEqual(f.removed, [])
})

test('text ceilings retain the recognized prefix and never pass oversized text to the composer', async t => {
  const f = fixture(t); await f.speech.start(); f.manager.onStart(); f.manager.onRecognize({ result: '字'.repeat(2001) })
  assert.equal(f.text.at(-1).length, 2000); assert.equal(f.errors.at(-1).text.length, 2000)
  assert.equal(f.errors.at(-1).code, 'VOICE_TEXT_LIMIT')
})

test('recognition is ignored until the new native start; malformed final result is an error retaining partial text', async t => {
  const f = fixture(t); await f.speech.start()
  f.manager.onRecognize({ result: '启动前旧结果' }); assert.deepEqual(f.text, [])
  f.manager.onStop({ result: '启动前旧结束' }); assert.deepEqual(f.complete, [])
  f.manager.onStart(); f.manager.onRecognize({ result: '部分结果' }); f.manager.onStop({ result: 42 })
  assert.deepEqual(f.complete, []); assert.deepEqual(f.errors, [{ code: 'VOICE_BAD_RESPONSE', text: '部分结果' }])
})
