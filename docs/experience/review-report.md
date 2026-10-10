# 小程序体验改造：审查报告

## 最终审查状态（2026-10-09）

任务 1–11 已完成独立复审；整分支复审发现的两项 P2 及两项非阻断问题已修复。最终修复代码 ae635db51d01e61eb1c633a7d7436e34f188f703 的独立复审结论为 Spec PASS / Quality APPROVED，已确认的重要发现剩余 0。复审实际运行 123 项针对性测试，核对 60 项测试文件摘要。以下阶段记录按发生顺序保留，其中“待复审”描述均为历史状态，不代表当前待办。远端 SHA、草稿 PR 和 CI 由交付报告记录；原生编译、真机、读屏、真实用户研究及线上数据库联调仍未完成。

## Historical stage: Current position

Tasks 1–10 have prior independent task reviews recorded by the controller. Task 11 implementation self-check is complete only to the attached automated/static evidence. Independent Task 11 review and full-branch review are not-run here; no reviewer approval or remote SHA is invented.

## Implementation self-review findings

1. Ordinary legacy tappable views/text lacked explicit button semantics. Reproduced with new source assertions; added semantics without changing handlers, targets or visual geometry.
2. Calendar and reusable-menu visual rows were text-only. Compared with approved v2 screens 04/10; adopted the existing compact row in read mode, preserving calendar actual-vs-plan people and historical dish IDs, hiding replacement controls, enabling menu dish reading with the menu's people.
3. Expanded approved UI tests found three stale calendar imports plus two obsolete expectations. See repair report. No safety assertion or failing test was removed; exact historical-people and account/write guards remain.
4. The current native test environment is absent. This is an acceptance blocker for release-level UX claims, not an automated-test failure or evidence of native correctness.

## Reviewer checklist

Review actual full diff and PR4/PR5 integration evidence, not this summary alone. Focus on immutable source/target across midnight/account switch; permission/deletion changes; old hidden locks; original-request retries/reentry; source quantities and checked undo; actual-history snapshots; rendered keyboard/large-text behavior. Review the saved-source header interpretation versus v2's illustration. Confirm own-menu read rows do not expose replacement or writes.

## Unfinished gates

- Independent Task 11 and whole-branch reviews, findings resolution and rerun
- Native compilation and supported runtime/device/user tests
- Fresh base/branch/PR read; remote incremental tree preserves every untouched original SHA/mode including 12 missing historical output files
- Publish one draft PR against `codex/v4-meal-workspace-green-20261003`, record exact remote SHA and inspect its status/check-runs/actions; absent CI means “no checks,” not “passed”
- User-accessible final report attachments, without automatic merge/deploy

## Task 11 review response

Independent Task 11 review requested T11-R1: actual recipe-return lifecycles were missing from the first acceptance journey. Fixed with observed RED/green evidence and explicit foreground API-read/target/write/next-step assertions; see repair report and `evidence/fix1-*.log`. Awaiting independent re-review. No whole-branch/publication/native gate is inferred passed.

## Whole-branch review and pending focused rereview

The independent whole-branch review at local head e13855b requested F1 (shopping durability across unload/5xx) and F2 (retained reduced-motion state), both P2. This repair wave implements those changes with new failing-then-passing lifecycle tests and 785 passing allowed Node tests, 99 allowed Java tests and successful static/package checks. It also resolves the nonblocking empty-save/help-copy observations; native focus restoration is still not-run. These are implementer evidence, not independent approval. A focused rereview of the repair diff and associations is required; publication/tree-preservation/CI remain controller gates.
