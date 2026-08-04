[← Back to docs index](../README.md)

# P4-POLISH-01 sandbox-evidence artifacts

Raw transcripts and browser artifacts backing the "Method" and §4/§6 claims in
[`pokie-phase4-inventory.md`](../pokie-phase4-inventory.md). The original 2026-08-04 implementer-sandbox
transcripts remain audit history. On 2026-08-05 the saved task clone was verified on a browser-capable host,
built, served through the real Studio HTTP server and captured with headless Google Chrome 138.0.7204.183.

| Artifact | What it proves |
| --- | --- |
| `pokie-examples-checkout.txt` | A real `git clone` of `github.com/sta-ger/pokie-examples`, pinned commit `530c2c7ff709361d93fe60f59b20436be719d209` (2026-07-09), full `src/**/*.ts` file tree with line counts, and `package.json` — the actual source §6's classification table was read from, not a representative-file sample over `raw.githubusercontent.com`. |
| `npm-wrapper-repro.txt` | This sandbox's `npm` (`/usr/local/bin/npm`, outside this worktree/repo) is a correction-round policy wrapper whose generated `case` pattern is itself malformed — `dash` rejects it with a syntax error on line 9 *before* any of the wrapper's own test-allowlist or policy logic runs, for every invocation including a plain `npm test -- <allowed file>`. Reproduced two ways (direct exec and explicit `bash -c`) to rule out a one-off fluke; the wrapper's own source is included so the exact malformed pattern is visible instead of asserted. |
| `browser-tooling-search.txt` | Historical implementer-sandbox constraint evidence; it does not describe the later browser-capable host capture. |
| `targeted-tests-run.txt` | This step's own required fixtures (`tests/cli/dispatch.test.ts`, `tests/cli/materialize/BlueprintProjectMaterializer.test.ts`, `tests/cli/commands/ReplayCommand.test.ts`) still pass, run directly via Jest for the reason `npm-wrapper-repro.txt` demonstrates. |
| `host-cli-transcripts.txt` | Host-side non-TTY `create` and random Blueprint-with-spaces transcripts, plus the real loaded Studio project-context response. |

## Real Studio/browser capture

The host ran `npm run build-esm`, `npm run build-cjs`, and `npm run build-cli` in the preserved task clone;
then ran the built `pokie studio` on loopback and used direct hash URLs after the real `/api/project/context`
endpoint became loaded. Chrome used `--headless=new --no-sandbox --window-size=1440,1100` and a five-second
virtual-time budget. A random Blueprint and loadable package both use paths containing spaces. The non-TTY
baseline transcript also proves current bare `pokie create` exits 0 and writes `starter-slot.blueprint.json`
while advising manual JSON editing — the precise regression Stage 4 must fix.

| Artifact | Settled real-browser state | SHA-256 |
| --- | --- | --- |
| `browser/project-overview.png` | Blueprint with spaces accepted by Studio; current materialization truthfully remains `Loading project…`. | `3d287afd68af15daabc05409d96519eab7c34793764604c4e52f1f9c46335067` |
| `browser/package-overview.png` | Real loaded tsPackage at a space-containing path; Overview shows valid metadata/capability. | `dd008ef3dc22e71cf7e6d1035ca4454aec44af13ac44a01e7424cef39da34d33` |
| `browser/package-replay.png` | Current Replay source split and best-effort reproduction language. | `5b50f34472a915224d417482522e5c35bce1d539a655c2b84f1f08bc252073ef` |
| `browser/package-runtime.png` | Current Runtime is a technical server/session/debug panel, not player-first Play. | `83071927cf1e513318feb202e7fe52403dbd634afcc51c311887c81ddef415bf` |
