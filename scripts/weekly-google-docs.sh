#!/usr/bin/env bash
set -euo pipefail
# Hermes runs this small launcher. The worker has its own timeout and durable queue.
systemctl --user start --no-block french-google-docs-sync.service
