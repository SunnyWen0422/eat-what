#!/bin/bash
# The previous script targeted an obsolete directory and systemd service.
# It must not upload files, overwrite private configuration, or restart production.
printf '%s\n' \
  'Deployment refused: this legacy entry point does not match the current server.' \
  'Use the reviewed candidate and migration procedure in:' \
  'docs/operations/2026-10-10-online-v4-candidate.md' \
  'Production changes require explicit approval, a fresh backup and verified service management.' >&2
exit 1

