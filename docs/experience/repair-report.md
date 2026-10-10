# 小程序体验改造：修复报告

## 最终状态

最终代码修复 ae635db 已通过独立复审。整分支两项 P2：购物写操作在离页/不确定结果下缺少可靠恢复，以及保留组件的减少动画设置未刷新，均已解决；空菜单入口与过时帮助文案一并修正。785 项 Node、99 项 Java、13 项 Python 及 83 个子测试和静态/离线打包检查通过。测试范围严格限定已审核白名单，模型相关测试（含离线路径）暂停。下文“待复审”均为历史执行阶段，已由最终独立复审关闭；真机与生产验收仍未完成。

## Repairs and retained assertions

| Observation | Change | Evidence |
|---|---|---|
| Ordinary view/text tap controls lacked role semantics | Add `aria-role="button"` only to actual nonempty tap handlers; inert tap-stop container untouched | New journey source checks fail before correction and pass after |
| Calendar/common-menu rows lacked v2 image/category fallbacks and menu recipe reading | Existing compact row gets read mode (no replace event/control), accepts historical dishId for view; menu detail gets verified numeric ID/people navigation | New read-row test fails before implementation; F07 still invokes real recipe preview for 6/4/3 people |
| account-boundaries, page-contracts, v4-business-contracts old harness missing calendar presentation utility | Import actual pure presentation helper in each explicit harness | Expanded regression original failure and rerun; original data/identity assertions unchanged |
| F01 expected blank error after new-account onShow then explicit empty Save | Now expects required-name error plus focus; before-onShow guard still expects blank reset | No writes and removal of private name/cuisine/tag/error remain asserted |
| F07 searched two legacy text links instead of authoritative shared row | Parse current compact component binding, evaluate source expression for planned and eaten cases | Still asserts exact historical/current people through real dish-detail preview; additionally asserts resolved source and exactly one shared link |

No old copy tests were deleted. All five expanded-suite failures are retained in the controller's RED log and resolved by exact fixture/approved-behavior updates. The first journey authoring attempt had a missing favorite API stub and wrong calendar method name; those were harness errors, not claimed product defects. The valid RED evidence is the missing semantics/verifier and read-row behavior.

## Preserved safeguards

No change to backend mutations, hard exclusions, account isolation, request journals, optimistic locks, historical actual facts, legacy protocol hashes or quantity arithmetic. No model tests, database writes, production calls, push, merge or deploy. No files under historical outputs were modified/deleted. No generated styles/assets were hand-edited; existing token/template pipeline is preserved and checked through isolated regeneration.

## Remaining limitations

The illustrative saved-result header differs from retained source-workspace identity for safety; destination feedback/link remain explicit. Native focus restoration and real usability are unproven. Final reviews/publication/remote CI are owned by later gates, not marked complete by this repair report.

## Review fix round 1 — T11-R1

Independent review correctly identified that the initial return assertion compared an unchanged in-memory menu after a navigation-log-only stub. Added a boundary-read count assertion first: it failed `1 !== 2` without the foreground lifecycle. The corrected journey uses fixed VM time, actual home onLoad/onHide, detail onLoad/onShow with completed initialization, detail onHide/onUnload, then awaits home.onShow. It proves exactly one new workspace read for the original date/meal, unchanged full menu and source target, no plan writes, and an enabled save next step. The three required assertions remain unchanged. No production code or other behavior was changed.

Fresh targeted result: 84/84; full explicit UI whitelist: 756/756; static syntax/templates/copy/assets: passed; diff check: clean. Java/package/Python evidence is unchanged and was not rerun for this test-only repair. Independent re-review and whole-branch/remote/native gates remain pending. The verifier's lexical entry-file scan is a narrow warning check, not a sandbox or a replacement for reviewing transitive imports.

## Whole-branch review repair wave

F1 now journals every shopping mutation before dispatch, preserving original account/request/version and undo context through unload and uncertain outcomes. Storage failure prevents sending. Direct/replay completion and conflict handling reject superseded requests; exact-request removal protects replacements. Older check receipts must validate returned booleans before acknowledgment. F2 refreshes retained dish/feedback motion on page visibility and new content, including account changes. Empty selected meals route to picking; help no longer advertises keep. Native focus restoration remains unverified.

Observed RED: 14 primary regressions; 3 follow-on replacement/polish failures; 4 authentication/timeout/throttling recovery failures plus 1 older-receipt failure. Two exact legacy source assertions updated for the stronger empty-save visibility condition and approved help copy; no tests removed or safety assertions loosened. Fresh targeted 167/167 and full 60-file Node allowlist 785/785, four static checks passed, offline Java 99/99 and offline package succeeded. See `evidence/final-fix-*.log` and the updated test audit. Focused independent rereview and native/remote/publication gates remain open.

Final three-file Python rerun: 13 passed, 83 subtests passed. Initial missing-CairoSVG environment failure is retained separately; adding its already-installed directory to PYTHONPATH resolved it. No dependency installation or model execution occurred.
