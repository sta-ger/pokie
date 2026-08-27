# PC-02 — blind CLI exploration

## Scope and freeze boundary

This is a clean package-consumer exploration, limited to the public first-contact
instructions in `README.md` and `docs/cli.md`, command/help entry points, visible
errors, and the package downloaded from the public npm registry.  No application
source, tests, or internal implementation files were inspected before the ledger
below was frozen.

The natural first action advertised by the public docs is `npx pokie`; the next
natural actions would have been `pokie --help`, command-specific help, and then a
non-interactive `create`/`build` journey.  The public package prevented that
chain before its first command could start.  Consequently, the remaining cases
are explicitly recorded as blocked at their public entry point rather than being
represented as untested successes.

### Environment and public-artifact observations

- Explorer worktree: clean at `b089846f2d7abc899477c9408b4a58786e1fe156`.
- The execution environment disallows `npx`; its visible response was
  `POKIE command policy: npx is disabled; use npm with named tests` (exit 126).
  This is a lab constraint, not a product finding.
- To inspect the same public install artifact without using source code,
  `https://registry.npmjs.org/pokie` was queried on 2026-08-27.  Its `latest`
  dist-tag was `1.2.2`; its published versions ended at `1.2.2`.
- The public URL for the working tree's advertised `pokie@1.3.0` returned HTTP
  404.  The downloaded `pokie@1.2.2` package's public `package.json` contains
  no `bin` field and its file list contained no `dist/cli/pokie.js`.
- Attempting the expected binary path against that downloaded artifact visibly
  failed with Node's `Cannot find module .../package/dist/cli/pokie.js` error.

The ledger was frozen immediately after those observations.  No source-guided
diagnosis or remediation followed.

## Frozen findings ledger

| ID | Observation (frozen) | Natural user intent | Actual outcome | Severity | Exact reproducer |
| --- | --- | --- | --- | --- | --- |
| PC02-01 | Public first-contact documentation tells a new user to run `npx pokie`, `npx pokie init <directory>`, and `npx pokie <command> --help`. | Discover the CLI and choose a safe starting workflow. | npm's public `latest` package is `1.2.2`; its manifest has no `bin`.  Thus no `pokie` executable is shipped by the package a normal unpinned install obtains. | Blocker | In an empty directory: `npm install pokie` followed by `npx pokie --help`.  Artifact verification: download `https://registry.npmjs.org/pokie/-/pokie-1.2.2.tgz`, extract it, and inspect `package/package.json`; it has no `bin`. |
| PC02-02 | The repository's public first-contact docs describe a CLI release whose package version is 1.3.0. | Install the documented version/workflow and receive the advertised CLI. | `https://registry.npmjs.org/pokie/-/pokie-1.3.0.tgz` returned HTTP 404 on 2026-08-27; registry metadata exposed versions only through 1.2.2. | Blocker | `curl -fL https://registry.npmjs.org/pokie/-/pokie-1.3.0.tgz -o pokie-1.3.0.tgz` (HTTP 404). |
| PC02-03 | `--help`, unknown-command recovery, and missing-input recovery are documented as command-level behavior. | Ask for help, mistype a command, or omit a required argument and use the displayed recovery guidance. | Blocked before command dispatch because the publicly installed package supplies no `pokie` command.  No CLI output was observed, so no command-behavior claim is made. | Blocker | After `npm install pokie`, try respectively: `npx pokie --help`, `npx pokie creat`, and `npx pokie build`; each depends on the missing binary. |
| PC02-04 | `create`/`init` are documented as the first ways to write a Blueprint or prepared package. | Create into a relative path, an absolute path, and a path containing spaces; retry against an existing/stale output. | Blocked before `create` or `init` can run because the published package has no CLI binary.  No files were generated and no overwrite/recovery behavior was observed. | Blocker | From a new directory after `npm install pokie`: `npx pokie create --blank --out './path with spaces/slot.blueprint.json'`; `npx pokie init ./relative-game`; `npx pokie init "$PWD/absolute game"`; then repeat either write. |
| PC02-05 | `build --dry-run` is documented as the natural preview before materializing a package. | Preview a build without writing output, then compare it with a real build and an existing output. | Blocked before `create` can generate the prerequisite Blueprint and before `build` can dispatch.  No dry-run or stale-output result was observed. | High | After producing a Blueprint by the public guide: `npx pokie build ./slot.blueprint.json --target tsPackage --out './out with spaces' --dry-run`; repeat without `--dry-run`. |
| PC02-06 | The docs publicly describe cancellation/EOF safety for interactive `create`, and preparation restart/recovery for `init`. | Interrupt a wizard, cancel a confirmation, or restart a partially prepared package without corrupting it. | Blocked before the `create` wizard or `init` preparation can start.  No cancellation, interrupted-work, or restart claim is made. | High | In an interactive terminal after `npm install pokie`: start `npx pokie create`, press Ctrl+C at a prompt; separately interrupt `npx pokie init ./recovery-game` during preparation and rerun the same command. |

## Inclusion ledger for the requested exploratory edges

| Edge | Publicly reachable in the installed package? | Result in this pass |
| --- | --- | --- |
| Wrong or missing inputs | No — command binary absent | PC02-03 records the blocked entry point and reproducer. |
| Relative paths | No — command binary absent | PC02-04 records the intended `init` path. |
| Absolute paths | No — command binary absent | PC02-04 records the intended `init` path. |
| Paths with spaces | No — command binary absent | PC02-04 records the intended `create`/`build` paths. |
| Existing or stale outputs | No — command binary absent | PC02-04 and PC02-05 record the intended repeats. |
| Dry run | No — command binary absent | PC02-05 records the documented preview path. |
| Interrupted or cancelled work | No — command binary absent | PC02-06 records the interactive and preparation paths. |
| Restart or recovery | No — command binary absent | PC02-06 records the rerun path. |

## PC-05 handoff — systemic patterns only

PC-05 must receive these frozen discovery patterns without treating this step as
a remediation vehicle:

1. **Publication/first-contact coherence:** the public docs advertise a CLI but
   npm `latest` (`1.2.2`) contains no executable, while the documented 1.3.0
   tarball is not publicly available.
2. **Downstream CLI coverage is masked:** every documented recovery, path,
   dry-run, cancellation, and restart path is unreachable to a package consumer
   until the publication/entrypoint mismatch is resolved.

No product source, package metadata, documentation, or implementation was
changed to remediate either pattern in PC-02.
