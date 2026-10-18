# EatWhat Project Guide

## Canonical Repository

This repository is the canonical EatWhat source tree. Do not synchronize from,
merge from, or treat any legacy external copy as authoritative.

## Agent Onboarding

Start with [the agent handoff guide](docs/agent-handoff.md), then read only the
task-relevant sources it links. Use [the operations runbook](docs/operations/agent-runbook.md)
for GitHub submission, branch cleanup, server access, database work or release.
The handoff guide records durable decisions; dated deployment/test reports are
historical evidence, not current server state or reusable permission. Update the
relevant guide when a confirmed decision changes, without copying credentials,
private logs or machine-specific paths into Git. Do not execute historical
scripts or `SERVER.md` command examples without checking the current runbook.

## Scope

This repository contains four cooperating applications:

- WeChat Mini Program frontend in the repository root, `pages/`, and `utils/`.
- Spring Boot 2.7 backend in `backend/`.
- FastAPI recommendation service in `recommend-service/`.
- Independent React web client in `web/`.

The web client is built separately and shares the
public catalog; its personal data is browser-local, not automatically synced to
the WeChat account. Treat mini-program and web releases as separate artifacts.

## Working Rules

- Read `DEVELOPER.md` before changing cross-service behavior.
- Keep credentials and machine-specific settings out of source control.
- Use `backend/src/main/resources/application.yml.example` and
  `recommend-service/.env.example` as configuration templates.
- Prefer environment variables for secrets and deployment-specific values.
- Preserve the existing mini-program API contract unless the task explicitly
  requires a coordinated frontend/backend change.
- Do not deploy, access production services, or run database migrations unless
  the user explicitly requests it.
- Do not edit generated artifacts such as `backend/target/` or `__pycache__/`.

## Development and Completion Protocol

Follow [the development workflow](docs/development-workflow.md) for behavioral
changes. It contains the task template and evidence-based iteration protocol.

- Before implementation, state the user outcome, preserved behavior, acceptance
  criteria and affected clients/services. Reuse an existing task plan; do not
  create a second plan or require approval for routine reversible work.
- For asynchronous or writing flows, enumerate relevant success, definite
  failure, unknown outcome, cancellation, expiry and partial-completion states.
  Specify input ownership, request identity and which results survive each
  transition. Mark irrelevant cases explicitly rather than adding mechanisms.
- When a contract crosses a changed boundary, test the real serializers,
  validators and callers on both sides with controlled fixtures. Mock external
  providers where appropriate, but do not mock away the boundary under review.
  Layer tests alone must not be reported as full-chain verification.
- Reproduce a behavioral defect before fixing it where feasible. Inspect other
  affected entry points and state transitions for the same cause; record what
  was checked. New findings are not automatically new regressions.
- Iterate on the highest-impact unmet criterion using evidence. Self-scores,
  test counts and reviewer approval cannot substitute for acceptance criteria.
  Stop unproductive identical retries; diagnose or report the blocker without
  calling unmet criteria complete. Respect real-model budgets and permissions.
- Review the final diff for scope, contract compatibility, failure handling and
  user-visible behavior. Record implementation, offline integration, real model,
  database, native UI and deployment evidence separately, tied to the tested
  revision. Reuse unchanged valid evidence and disclose untested areas.
- Documentation-only changes require consistency, reference and diff checks,
  not application tests or a mandatory independent review. Existing authorized
  work and user decisions persist; ask only when a consequential unknown cannot
  be resolved within them. Never infer production authorization from a local task.

## Verification

### GitHub Push Workflow

- Before the first push, check the target branch, HEAD, origin and available Git/proxy settings. On Windows, Git may not inherit an enabled system proxy; inspect that setting before repeated direct connection attempts.
- Reuse an enabled proxy with a command-scoped `git -c http.proxy=...`; do not persist machine-specific values or credentials, change global settings, or disable certificate verification.
- Retry an identical connection failure at most once without new evidence. Classify MSYS `0xC0000022`, `waitpid` and credential-helper failures as possible execution-environment restrictions; an unreadable token here does not prove the user's ordinary terminal login is invalid.
- If the credential helper remains unavailable, provide one ordinary-terminal push command instead of repeated protocol/credential experiments. Do not substitute unrelated SSH keys, recreate commit history, or force-push.
- Claim success only after the target remote branch SHA is verified against local HEAD. Local machine observations belong in the parent workspace rules, outside this repository.

Choose verification by impact, following `docs/development-workflow.md`. The
user's current preference is targeted regression after fixes, not repeated full
suites. Keep existing required business checks, CI and release gates; if a
required gate cannot be run, report it as unverified rather than waived.
The repository-wide verification entry is available when its scope is justified:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1
```

For backend source changes, also verify packaging (this does not run tests):

```powershell
mvn -f .\backend\pom.xml -DskipTests package
```

For recommendation-service changes, check compilation of affected Python files
and run relevant isolated behavioral/contract regressions. Do not invoke the full
script merely to compile one module. Tests must not silently load production
credentials or consume real-model budget.

## Local Configuration

1. Copy `backend/src/main/resources/application.yml.example` to
   `backend/src/main/resources/application.yml` and provide local values.
2. Copy `recommend-service/.env.example` to `recommend-service/.env` and provide
   local values.
3. Open the repository root in WeChat Developer Tools for frontend development.
