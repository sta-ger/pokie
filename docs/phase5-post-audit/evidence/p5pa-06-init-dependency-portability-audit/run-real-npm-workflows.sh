#!/usr/bin/env bash
# Independent host-side P5PA-06 evidence runner.  It uses only the public npm
# executable and the packaged/linked pokie CLI; all mutable workflow state is
# isolated in a temporary directory and selected resulting artifacts are copied
# into this evidence directory by the caller's normal filesystem operations.
set -Eeuo pipefail

candidate_root=$(cd "$(dirname "$0")/../../../.." && pwd)
evidence_dir=$(cd "$(dirname "$0")" && pwd)/host-cli-rerun-20260811
work_dir=$(mktemp -d "${TMPDIR:-/tmp}/p5pa-06-real-npm.XXXXXX")

cleanup() {
    rm -rf "$work_dir"
}
trap cleanup EXIT

run() {
    printf '\n$'
    printf ' '
    printf '%q ' "$@"
    printf '\n'
    "$@"
}

capture_package() {
    local source_root=$1
    local destination=$2
    mkdir -p "$destination/src" "$destination/dist"
    cp "$source_root/package.json" "$source_root/package-lock.json" "$source_root/tsconfig.json" "$destination/"
    cp "$source_root/src/index.ts" "$destination/src/"
    cp "$source_root/dist/index.js" "$destination/dist/"
    node -e '
      const fs = require("fs");
      const path = process.argv[1];
      const pkg = JSON.parse(fs.readFileSync(path + "/package.json", "utf8"));
      const lock = JSON.parse(fs.readFileSync(path + "/package-lock.json", "utf8"));
      const packageKeys = Object.keys(lock.packages || {});
      const summary = {
        packageRoot: path,
        pokieDependency: pkg.dependencies && pkg.dependencies.pokie,
        packageJsonContainsFileSpec: fs.readFileSync(path + "/package.json", "utf8").includes("file:"),
        lockHasPokieLinkEntry: Object.prototype.hasOwnProperty.call(lock.packages || {}, "node_modules/pokie"),
        lockKeysWithAbsolutePath: packageKeys.filter(key => key.includes("/tmp/") || key.includes("/home/") || key.includes("\\\\")),
        packageCount: packageKeys.length
      };
      process.stdout.write(JSON.stringify(summary, null, 2) + "\n");
    ' "$source_root" > "$destination/persisted-metadata-summary.json"
}

mkdir -p "$evidence_dir/artifacts"

printf 'candidate_root=%s\n' "$candidate_root"
printf 'work_dir=%s\n' "$work_dir"

run npm --version
run node --version

# Packaging form: produce a genuine npm tarball.  `dist/` is committed for this
# package and is checked below; `--ignore-scripts` keeps this independent
# installation-form rerun bounded to npm pack/install rather than repeating the
# repository-wide lint lifecycle (captured separately if it is desired).
test -f "$candidate_root/dist/cli/pokie.js"
run npm pack --ignore-scripts --pack-destination "$evidence_dir/artifacts"
tarball=$(find "$evidence_dir/artifacts" -maxdepth 1 -type f -name '*.tgz' -print -quit)
test -n "$tarball"
printf 'tarball=%s\n' "$tarball"
run sha256sum "$tarball"

# Install the tarball as a normal npm consumer, then drive its installed binary.
pack_consumer="$work_dir/pack-consumer"
run mkdir -p "$pack_consumer"
(cd "$pack_consumer" && run npm init --yes && run npm install "$tarball" --ignore-scripts --no-audit --no-fund)
pack_bin="$pack_consumer/node_modules/.bin/pokie"
test -x "$pack_bin"
pack_project="$pack_consumer/packed-init-project"
run "$pack_bin" init "$pack_project"
run "$pack_bin" validate "$pack_project"
capture_package "$pack_project" "$evidence_dir/artifacts/npm-pack-init-project"

# Copy only persisted package metadata/source/build output.  No node_modules is
# copied; the supported public CLI retries npm install from the copied project.
copied_project="$pack_consumer/packed-init-project-copy"
run mkdir -p "$copied_project/src" "$copied_project/dist"
run cp "$pack_project/package.json" "$pack_project/package-lock.json" "$pack_project/tsconfig.json" "$copied_project/"
run cp "$pack_project/src/index.ts" "$copied_project/src/"
run cp "$pack_project/dist/index.js" "$copied_project/dist/"
test ! -e "$copied_project/node_modules"
capture_package "$copied_project" "$evidence_dir/artifacts/npm-pack-copy-before-reinstall"
run "$pack_bin" init "$copied_project"
run "$pack_bin" validate "$copied_project"
capture_package "$copied_project" "$evidence_dir/artifacts/npm-pack-copy-after-reinstall"

# Move the npm-pack initialized package with its existing resolved modules and
# validate it from the same installed CLI without invoking npm again.
moved_project="$pack_consumer/packed-init-project-moved"
run mv "$pack_project" "$moved_project"
run "$pack_bin" validate "$moved_project"
capture_package "$moved_project" "$evidence_dir/artifacts/npm-pack-moved-project"

# Link form: npm creates the consumer link; run that linked binary's public init
# workflow and then validate the generated package.
link_prefix="$work_dir/link-prefix"
link_consumer="$work_dir/link-consumer"
run mkdir -p "$link_prefix/lib/node_modules" "$link_consumer"
(cd "$link_consumer" && run npm init --yes && npm_config_prefix="$link_prefix" run npm link "$candidate_root")
link_bin="$link_consumer/node_modules/.bin/pokie"
test -x "$link_bin"
link_project="$link_consumer/linked-init-project"
run "$link_bin" init "$link_project"
run "$link_bin" validate "$link_project"
capture_package "$link_project" "$evidence_dir/artifacts/npm-link-init-project"

printf '\nP5PA-06 real npm workflow completed successfully.\n'
