const test = require('node:test')
const assert = require('node:assert/strict')
const { createAssistantVoice } = require('../utils/assistant-voice')

function fixture(extra = {}) {
  const f = {
    draft: '清淡', binding: { account: 'user:1', sessionId: 'chat:1', date: '2026-10-28', mealType: 'dinner', generation: 1 },
    capability: { enabled: true, maxDurationMs: 30000, maxTextLength: 2000 },
    current: true, busy: false, transports: [], notices: [], states: [], tickets: 0
  }
  class Transport {
    constructor(options) { this.options = options; this.canceled = 0; this.stops = 0; f.transports.push(this) }
    async start() { this.options.onPhase('recording') }
    stop() { this.stops++; this.options.onPhase('processing') }
    cancel() { this.canceled++ }
  }
  f.wx = { getRecorderManager() {}, connectSocket() {}, authorize: ({ success }) => success() }
  Object.assign(f, extra)
  f.voice = createAssistantVoice({
    api: { createVoiceSession: async () => { f.tickets++; return {} } }, Transport,
    wx: f.wx, getBinding: () => f.binding, getDraft: () => f.draft,
    setDraft: value => { f.draft = value }, getCapability: () => f.capability,
    isCurrent: () => f.current, isBusy: () => f.busy,
    onState: value => f.states.push(value), onFeedback: value => f.notices.push(value)
  })
  return f
}

test('tap starts and stops; normal final becomes an editable draft with the original typed text', async () => {
  const f = fixture()
  await f.voice.tap()
  assert.equal(f.voice.snapshot().phase, 'recording')
  assert.equal(f.voice.snapshot().inputLocked, true)
  const t = f.transports[0]
  t.options.onText('不要花生')
  assert.equal(f.draft, '清淡 不要花生')
  await f.voice.tap()
  assert.equal(t.stops, 1)
  assert.equal(f.voice.snapshot().phase, 'processing')
  t.options.onComplete('不要花生和虾')
  assert.equal(f.draft, '清淡 不要花生和虾')
  assert.equal(f.voice.snapshot().phase, 'idle')
  assert.equal(f.voice.snapshot().inputLocked, false)
  assert.equal(f.tickets, 0)
})

test('cancel restores the base and ignores every callback from that generation', async () => {
  const f = fixture()
  await f.voice.tap(); const t = f.transports[0]
  t.options.onText('中间结果'); f.voice.cancel()
  assert.equal(f.draft, '清淡')
  assert.equal(t.canceled, 1)
  t.options.onText('迟到'); t.options.onComplete('迟到'); t.options.onError('VOICE_FINAL_TIMEOUT', '迟到')
  assert.equal(f.draft, '清淡')
  await f.voice.tap(); t.options.onText('前一轮'); assert.equal(f.draft, '清淡')
  f.voice.cancel()
})

test('errors preserve partial text; subsequent input is never overwritten or restored over user edits', async () => {
  const f = fixture()
  await f.voice.tap(); let t = f.transports[0]
  t.options.onText('少盐'); t.options.onError('VOICE_CONNECTION_CLOSED', '少盐')
  assert.equal(f.draft, '清淡 少盐')
  await f.voice.tap(); t = f.transports[1]; t.options.onText('少油')
  f.draft = '我自己修改了文字'
  t.options.onComplete('后续识别')
  assert.equal(f.draft, '我自己修改了文字')
  assert.equal(f.voice.snapshot().phase, 'idle')
  await f.voice.tap(); f.draft = '新的编辑'; f.voice.cancel()
  assert.equal(f.draft, '新的编辑')
})

test('all ownership dimensions invalidate late results without changing the new context draft', async () => {
  for (const key of ['account', 'sessionId', 'date', 'mealType', 'generation']) {
    const f = fixture(); await f.voice.tap(); const t = f.transports[0]
    f.binding = { ...f.binding, [key]: `${f.binding[key]}:new` }; f.draft = '新会话草稿'
    t.options.onText('旧结果'); t.options.onComplete('旧结果')
    assert.equal(f.draft, '新会话草稿', key)
    assert.equal(t.canceled, 1, key)
    assert.equal(f.voice.snapshot().phase, 'idle', key)
  }
})

test('hide/dispose cancels immediately and blocks pending authorization and new starts', async () => {
  let permit
  const f = fixture({ wx: { getRecorderManager() {}, connectSocket() {}, authorize: value => { permit = value } } })
  await f.voice.tap()
  f.voice.dispose(); permit.success()
  assert.equal(f.transports.length, 0)
  assert.equal(f.tickets, 0)
  await f.voice.tap(); assert.equal(f.transports.length, 0)
  const g = fixture(); await g.voice.tap(); g.current = false; g.voice.sync()
  assert.equal(g.transports[0].canceled, 1)
  assert.equal(g.voice.snapshot().inputLocked, false)
})

test('privacy consent explicitly gates microphone permission; denial and missing APIs keep typing usable', async () => {
  let permissions = 0, privacyOpened = 0
  const f = fixture({ wx: {
    getRecorderManager() {}, connectSocket() {}, getPrivacySetting: ({ success }) => success({ needAuthorization: true }),
    authorize: ({ success }) => { permissions++; success() }, openPrivacyContract: () => privacyOpened++
  } })
  await f.voice.tap()
  assert.equal(f.voice.snapshot().privacyVisible, true)
  assert.equal(permissions, 0)
  f.voice.openPrivacy(); assert.equal(privacyOpened, 1)
  await f.voice.agreePrivacy(); assert.equal(permissions, 1)
  f.voice.cancel()
  const denied = fixture({ wx: { getRecorderManager() {}, connectSocket() {}, authorize: ({ fail }) => fail() } })
  await denied.voice.tap(); assert.equal(denied.voice.snapshot().phase, 'idle'); assert.equal(denied.draft, '清淡')
  const missing = fixture({ wx: {} }); await missing.voice.tap()
  assert.equal(missing.voice.snapshot().inputLocked, false); assert.equal(missing.tickets, 0)
})

test('disabled capability, busy state and missing binding cannot authorize or create a session', async () => {
  for (const extra of [{ capability: null }, { capability: { enabled: false } }, { busy: true }, { binding: null }]) {
    const f = fixture(extra); await f.voice.tap(); assert.equal(f.tickets, 0); assert.equal(f.transports.length, 0)
  }
})

test('configured limits never exceed 30 seconds/2000 characters and cannot truncate typed text', async () => {
  const f = fixture({ draft: '字'.repeat(1998), capability: { enabled: true, maxDurationMs: 90000, maxTextLength: 9000 } })
  await f.voice.tap(); const t = f.transports[0]
  assert.equal(t.options.maxDurationMs, 30000); assert.equal(t.options.maxTextLength, 1)
  t.options.onText('你好'); assert.equal(f.draft, '字'.repeat(1998) + ' 你')
  f.voice.cancel(); assert.equal(f.draft.length, 1998)
  f.draft = '字'.repeat(2000); await f.voice.tap(); assert.equal(f.transports.length, 1)
})

test('duplicate native permission callbacks cannot open two microphone transports', async () => {
  let permit
  const f = fixture({ wx: { getRecorderManager() {}, connectSocket() {}, authorize: value => { permit = value } } })
  await f.voice.tap(); permit.success(); permit.success()
  await Promise.resolve(); await Promise.resolve()
  assert.equal(f.transports.length, 1)
  assert.equal(f.tickets, 0)
  f.voice.cancel()
})

test('privacy errors and thrown microphone APIs release input without issuing tickets', async () => {
  for (const wx of [
    { getRecorderManager() {}, connectSocket() {}, authorize() {}, getPrivacySetting: ({ fail }) => fail() },
    { getRecorderManager() {}, connectSocket() {}, authorize() { throw Error('unavailable') } },
    { getRecorderManager() {}, connectSocket() {}, authorize() {}, getPrivacySetting() { throw Error('unavailable') } }
  ]) {
    const f = fixture({ wx }); await f.voice.tap()
    assert.equal(f.voice.snapshot().inputLocked, false); assert.equal(f.tickets, 0); assert.equal(f.draft, '清淡')
  }
})

test('cancel during pending plugin start blocks its eventual native callbacks without requesting cloud tickets', async () => {
  let resolveStart, options, cancels = 0
  const f = fixture()
  const voice = createAssistantVoice({
    api: { createVoiceSession: () => { throw Error('cloud ticket must not be requested') } }, wx: f.wx,
    Transport: class {
      constructor(value) { options = value }
      async start() { await new Promise(resolve => { resolveStart = resolve }); options.onPhase('recording'); options.onText('迟到') }
      cancel() { cancels++ }
    }, getBinding: () => f.binding, getDraft: () => f.draft, setDraft: value => { f.draft = value }, getCapability: () => f.capability
  })
  const pending = voice.tap(); voice.cancel(); resolveStart(); await pending
  assert.equal(voice.snapshot().phase, 'idle'); assert.equal(cancels, 1); assert.equal(f.draft, '清淡')
})

test('default WechatSI adapter and transport finalize plugin text without a recorder, socket or cloud ticket', async t => {
  const removed = []
  let text = '午餐', calls = 0
  const manager = { start: () => manager.onStart(), stop: () => manager.onStop({ result: '不要花生', tempFilePath: 'wxfile://tmp_assistant.mp3' }) }
  const native = {
    authorize: request => request.success(),
    getFileSystemManager: () => ({ unlink: request => removed.push(request.filePath) })
  }
  const voice = createAssistantVoice({ wx: native,
    api: { createVoiceSession: () => { calls++; throw Error('cloud ticket must not be requested') } },
    pluginManifest: { plugins: { WechatSI: { provider: 'wx069ba97219f66d99', version: '1.2.3' } } },
    loadPlugin: () => ({ getRecordRecognitionManager: () => manager }),
    getBinding: () => ({ account: 'test-user', sessionId: 'test-session', date: '2026-10-28', mealType: 'lunch', generation: 1 }),
    getDraft: () => text, setDraft: value => { text = value }, getCapability: () => ({ enabled: true })
  })
  t.after(() => { voice.dispose() })
  await voice.tap()
  assert.equal(voice.snapshot().phase, 'recording')
  manager.onRecognize({ result: '不要花生' })
  assert.equal(text, '午餐 不要花生')
  await voice.tap()
  assert.equal(voice.snapshot().phase, 'idle'); assert.equal(text, '午餐 不要花生')
  assert.equal(calls, 0); assert.deepEqual(removed, ['wxfile://tmp_assistant.mp3'])
})
