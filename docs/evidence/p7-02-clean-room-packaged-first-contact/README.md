# P7-02 independent clean-room packaged CLI rerun

Candidate: `75e941f7b25394f7d09b0c737f266af68e2345db` (`pokie@1.3.0`).

## Provenance and isolation

From that checkout, `npm pack --ignore-scripts --silent` produced
`pokie-1.3.0.tgz` with SHA-256
`1978769a8b53cb32c5e71aad848a04b126685bda1ec5b9c60e3d414d2026e310`.
The tarball contained `package/package.json`, `package/README.md`,
`package/dist/cli/pokie.js`, and the built Studio-client entrypoint. It was
installed by `npm install <tarball>` in a newly-created temporary project;
the invoked executable resolved to that project's
`node_modules/pokie/dist/cli/pokie.js`. Public `README.md` and `docs/cli.md`
were copied into that temporary project for the documented first-contact
instructions. No checkout executable, private API, or Studio launch was used.

`docs/cli.md` states that bare `npx pokie` prints next actions without starting
a server or writing files. The installed bare command returned normally with
exit `0`, printed `pokie init <directory>`, `pokie create <name>`, and
`pokie <command> --help`, and printed neither a listening URL nor a Studio
message. A post-command process check found no Node executable under the
temporary installed package. Thus it did not leave an implicit Studio process
running.

## Installed CLI transcript (selected complete results)

| Command | Exit | Recorded output check |
| --- | ---: | --- |
| `pokie` | 0 | first-contact next steps and `Usage: pokie <command>` |
| `pokie --help` | 0 | usage, command list, and next steps |
| `pokie -h` | 0 | same root usage and command list |
| `pokie --version` | 0 | `1.3.0` |
| `pokie -V` | 0 | `1.3.0` |
| `pokie not-a-command` | 1 | `Unknown command "not-a-command". Run \`pokie --help\` to list commands.` |
| `pokie creat` | 1 | `Did you mean \`create\`? Run \`pokie create --help\` for usage.` |
| `pokie build` | 1 | `Usage: pokie build <project> --target <artifact> ...`, followed by the `<project>` recovery explanation |

Root help plus every discovered top-level command help returned `0` and had a
`Usage:` line (21 pages including root). The nested command-local help pages
also each returned `0` with an `Options:` section:

`certification build`, `certification verify`, `fairness seed-commit`,
`fairness commit`, `fairness reveal`, `fairness verify`, and `reel generate`.

## Required whole-file targeted command

Ran exactly as one serial Jest command against the candidate:

```text
npm run test:targeted -- tests/scripts/check-cli-inventory.test.mjs tests/cli/publicCommandTree.test.ts tests/cli/client/clientPresentation.test.ts tests/packaging/npmPackSmoke.test.ts
```

Result: exit `1`; 3 suites passed and 1 failed (38 passed tests, 1 failed).

| File | Result |
| --- | --- |
| `tests/scripts/check-cli-inventory.test.mjs` | **FAIL** — the complete public-documentation scan reports stale/unowned `argument:create:<name>`, `argument:root:<command>`, `argument:init:<directory>`, and `command:creat` capabilities. |
| `tests/cli/publicCommandTree.test.ts` | PASS |
| `tests/cli/client/clientPresentation.test.ts` | PASS |
| `tests/packaging/npmPackSmoke.test.ts` | PASS (real pack/install/spawn smoke) |

This is retained as the bounded finding proof; temporary tarballs, installs,
test logs, and generated build output are not retained in this commit.
