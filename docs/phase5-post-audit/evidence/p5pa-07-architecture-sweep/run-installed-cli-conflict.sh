#!/usr/bin/env bash
# Public host-side workflow for P5PA-07.  It packages this candidate, installs
# the package into an isolated npm consumer, and invokes the installed pokie
# executable against the committed conflicting package fixture.
set -Eeuo pipefail

candidate_root=$(cd "$(dirname "$0")/../../../.." && pwd)
evidence_dir=$(cd "$(dirname "$0")" && pwd)
fixture_dir="$evidence_dir/artifacts/conflicting-pokie-init-project"
task_nodebin=/home/stager/.nvm/versions/node/v24.18.0/bin
task_workdir=$(mktemp -d "${TMPDIR:-/tmp}/p5pa-07-installed-cli.XXXXXX")

cleanup() {
    rm -rf "$task_workdir"
}
trap cleanup EXIT

export PATH="$task_nodebin:$PATH"

run() {
    printf '\n$ '
    printf '%q ' "$@"
    printf '\n'
    "$@"
}

printf 'candidate_root=%s\n' "$candidate_root"
printf 'fixture_dir=%s\n' "$fixture_dir"
run node --version
run npm --version
run npm pack --ignore-scripts --pack-destination "$evidence_dir/artifacts"

task_tarball=$(find "$evidence_dir/artifacts" -maxdepth 1 -type f -name 'pokie-*.tgz' -print -quit)
test -n "$task_tarball"
run sha256sum "$task_tarball"

task_consumer="$task_workdir/consumer"
run mkdir -p "$task_consumer"
(
    cd "$task_consumer"
    run npm init --yes
    run npm install "$task_tarball" --ignore-scripts --no-audit --no-fund
)

task_pokie="$task_consumer/node_modules/.bin/pokie"
test -x "$task_pokie"
(
    cd "$task_consumer"
    run npm ls pokie --depth=0
)

task_before=$(sha256sum "$fixture_dir/package.json" | awk '{print $1}')
printf '\n$ '
printf '%q ' "$task_pokie" init "$fixture_dir" --yes --no-prepare
printf '\n'
set +e
"$task_pokie" init "$fixture_dir" --yes --no-prepare
task_exit=$?
set -e
printf 'exit=%s\n' "$task_exit"
test "$task_exit" -eq 1

task_after=$(sha256sum "$fixture_dir/package.json" | awk '{print $1}')
test "$task_before" = "$task_after"
printf 'package_json_sha256_before=%s\n' "$task_before"
printf 'package_json_sha256_after=%s\n' "$task_after"
printf 'P5PA-07 public installed-CLI conflict workflow completed as expected.\n'
