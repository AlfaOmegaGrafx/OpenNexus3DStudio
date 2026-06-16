#!/bin/sh
# Installed as .git/hooks/pre-commit — blocks secrets and local-only paths.
exec sh "$(git rev-parse --show-toplevel)/scripts/pre-commit-block-secrets.sh"
