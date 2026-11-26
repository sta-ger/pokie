#!/bin/bash
# Double-click launcher for a POKIE checkout on Linux.
cd "$(dirname "$0")" || exit 1
exec bash scripts/launch-studio.sh "$@"
