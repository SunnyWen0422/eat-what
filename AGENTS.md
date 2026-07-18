# EatWhat Project Guide

## Canonical Repository

This repository is the canonical EatWhat source tree. Do not synchronize from,
merge from, or treat any legacy external copy as authoritative.

## Scope

This repository contains three cooperating applications:

- WeChat Mini Program frontend in the repository root, `pages/`, and `utils/`.
- Spring Boot 2.7 backend in `backend/`.
- FastAPI recommendation service in `recommend-service/`.

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

## Verification

Run the repository verification script after code changes:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\verify.ps1
```

For backend-only changes, also run:

```powershell
mvn -f .\backend\pom.xml test
```

For recommendation-service changes, at minimum run Python compilation through
`scripts/verify.ps1`; add focused tests when behavior changes.

## Local Configuration

1. Copy `backend/src/main/resources/application.yml.example` to
   `backend/src/main/resources/application.yml` and provide local values.
2. Copy `recommend-service/.env.example` to `recommend-service/.env` and provide
   local values.
3. Open the repository root in WeChat Developer Tools for frontend development.
