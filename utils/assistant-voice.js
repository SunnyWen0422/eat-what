const { WechatSpeech, VOICE_MAX_DURATION_MS, VOICE_MAX_TEXT_LENGTH } = require('./wechat-speech')

const BINDING_KEYS = ['account', 'sessionId', 'date', 'mealType', 'generation']
function limit(value, maximum) {
  return Number.isFinite(value) && value > 0 ? Math.min(Math.floor(value), maximum) : maximum
}

/**
 * Voice only edits a draft; this module has no send/action hook.
 * getBinding returns stable { account, sessionId, date, mealType, generation } values.
 * Host locks its input/send controls while snapshot().inputLocked, calls sync() on
 * binding/capability changes, and dispose() on hide/unload (recreate on show).
 * setDraft must update getDraft synchronously, as conversation.setInput does.
 */
function createAssistantVoice(options) {
  const platform = options.wx || (typeof wx === 'undefined' ? {} : wx)
  const Transport = options.Transport || WechatSpeech
  let active = null
  let disposed = false
  let phase = 'idle'
  let privacyVisible = false

  const capability = () => options.getCapability && options.getCapability()
  const enabled = () => { const value = capability(); return !!value && value.enabled === true }
  const draft = () => String(options.getDraft() || '')
  const binding = () => options.getBinding && options.getBinding()
  const sameBinding = run => {
    const next = binding()
    return !!next && BINDING_KEYS.every(key => next[key] === run.binding[key])
  }
  const current = () => !disposed && (!options.isCurrent || options.isCurrent())
  const snapshot = () => ({ enabled: enabled(), phase, inputLocked: !!active, privacyVisible })
  const emit = () => { if (options.onState) options.onState(snapshot()) }
  const feedback = text => { if (options.onFeedback) options.onFeedback(text) }
  function abandon(restore) {
    const run = active
    if (!run) return
    active = null
    phase = 'idle'; privacyVisible = false
    if (run.transport) run.transport.cancel()
    // A caller may edit despite the UI lock. That edit takes ownership forever.
    if (restore && sameBinding(run) && draft() === run.lastDraft) options.setDraft(run.base)
    emit()
  }
  function owns(run) {
    if (!run || active !== run) return false
    if (!current() || !enabled() || !sameBinding(run)) { abandon(false); return false }
    if (draft() !== run.lastDraft) { abandon(false); return false }
    return true
  }
  function update(run, text) {
    if (!owns(run)) return false
    const recognized = String(text || '').slice(0, run.remaining)
    run.lastDraft = run.base + (run.base && recognized ? ' ' : '') + recognized
    options.setDraft(run.lastDraft)
    return true
  }
  function finish(run, text, error) {
    if (!update(run, text)) return
    active = null; phase = 'idle'; privacyVisible = false
    emit()
    feedback(error ? '语音中断，文字已保留，请核对后发送' : text ? '已转成文字，核对后发送' : '没有听清，可重试或继续打字')
  }
  async function start(run) {
    if (!owns(run) || run.started) return
    run.started = true
    phase = 'connecting'; privacyVisible = false; emit()
    try {
      run.transport = new Transport({
        maxTextLength: run.remaining, maxDurationMs: run.maxDurationMs,
        wx: platform, manifest: options.pluginManifest, loadPlugin: options.loadPlugin,
        onPhase: value => {
          if (!owns(run)) return
          if (['connecting', 'recording', 'processing'].includes(value)) { phase = value; emit() }
        },
        onText: text => { if (update(run, text)) run.partial = String(text || '') },
        onComplete: text => finish(run, text, false),
        onError: (_code, text) => finish(run, text || run.partial, true)
      })
      await run.transport.start()
    } catch (_) { finish(run, run.partial, true) }
  }
  function authorize(run) {
    if (!owns(run) || run.permissionRequested) return
    run.permissionRequested = true
    privacyVisible = false; emit()
    try {
      platform.authorize({ scope: 'scope.record', success: () => { run.startPromise = start(run) }, fail: () => {
        if (!owns(run)) return
        abandon(true); feedback('未开启麦克风，可继续打字')
      } })
    } catch (_) {
      if (owns(run)) { abandon(true); feedback('麦克风暂不可用，可继续打字') }
    }
  }
  return {
    snapshot,
    async tap() {
      if (!current()) return
      if (active) {
        if (owns(active) && phase === 'recording') this.stop()
        return
      }
      if (!enabled() || options.isBusy && options.isBusy()) return
      if (typeof platform.authorize !== 'function') {
        feedback('当前环境无法录音，可继续打字'); return
      }
      const target = binding()
      if (!target || BINDING_KEYS.some(key => target[key] == null || target[key] === '')) return
      const settings = capability(), base = draft()
      const remaining = limit(settings.maxTextLength, VOICE_MAX_TEXT_LENGTH) - base.length - (base ? 1 : 0)
      if (remaining < 1) { feedback('请先缩短输入文字，再使用语音'); return }
      const run = { binding: { ...target }, base, lastDraft: base, partial: '', remaining,
        maxDurationMs: limit(settings.maxDurationMs, VOICE_MAX_DURATION_MS) }
      active = run; phase = 'authorizing'; emit()
      try {
        if (typeof platform.getPrivacySetting === 'function') platform.getPrivacySetting({
          success: result => {
            if (!owns(run)) return
            if (result && result.needAuthorization) { privacyVisible = true; emit() }
            else authorize(run)
          },
          fail: () => { if (owns(run)) { abandon(true); feedback('无法确认麦克风隐私授权，可继续打字') } }
        })
        else authorize(run)
      } catch (_) { if (owns(run)) { abandon(true); feedback('麦克风暂不可用，可继续打字') } }
      return run.startPromise
    },
    stop() {
      const run = active
      if (!owns(run) || phase !== 'recording') return
      phase = 'processing'; emit()
      try { run.transport.stop() } catch (_) { finish(run, run.partial, true) }
    },
    cancel() { abandon(true) },
    agreePrivacy() { const run = active; if (privacyVisible && owns(run)) { authorize(run); return run.startPromise } },
    openPrivacy() {
      if (!privacyVisible || !active || !owns(active)) return
      try { if (typeof platform.openPrivacyContract === 'function') platform.openPrivacyContract({}) } catch (_) {}
    },
    sync() { if (active) owns(active); return snapshot() },
    dispose() { if (disposed) return; abandon(true); disposed = true }
  }
}
module.exports = { createAssistantVoice }
