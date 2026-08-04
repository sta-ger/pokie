[← Back to docs index](../README.md)

# P4-POLISH-01 sandbox-evidence artifacts

Raw transcripts backing the "Method" and §4/§6 claims in
[`pokie-phase4-inventory.md`](../pokie-phase4-inventory.md), captured 2026-08-04 in the implementer
sandbox for this step. Unlike [`phase2-browser-evidence`](../phase2-browser-evidence/README.md) (a real
Chrome pass against a built `pokie studio` server), these are *not* browser screenshots — this step's own
sandbox has no browser binary and no build-tool access (see `browser-tooling-search.txt`), so the evidence
here is scoped to what this sandbox actually could produce: reproducible transcripts of a real synced
`pokie-examples` checkout and of the environment constraints that block a fresh Studio/browser visual pass.

| Artifact | What it proves |
| --- | --- |
| `pokie-examples-checkout.txt` | A real `git clone` of `github.com/sta-ger/pokie-examples`, pinned commit `530c2c7ff709361d93fe60f59b20436be719d209` (2026-07-09), full `src/**/*.ts` file tree with line counts, and `package.json` — the actual source §6's classification table was read from, not a representative-file sample over `raw.githubusercontent.com`. |
| `npm-wrapper-repro.txt` | This sandbox's `npm` (`/usr/local/bin/npm`, outside this worktree/repo) is a correction-round policy wrapper whose generated `case` pattern is itself malformed — `dash` rejects it with a syntax error on line 9 *before* any of the wrapper's own test-allowlist or policy logic runs, for every invocation including a plain `npm test -- <allowed file>`. Reproduced two ways (direct exec and explicit `bash -c`) to rule out a one-off fluke; the wrapper's own source is included so the exact malformed pattern is visible instead of asserted. |
| `browser-tooling-search.txt` | No Chromium/Chrome/Firefox binary exists anywhere on this sandbox's filesystem; no `puppeteer`/`playwright`/`karma`/`chrome-launcher` dependency or reference exists in this repo; `npx` (which could fetch one on demand) is explicitly disabled by the same correction-round wrapper; and no compiled `dist/` exists to serve a built Studio server from in the first place. Together these are why this step does not attempt a fresh visual Studio/browser pass — see `pokie-phase4-inventory.md` §4 for the full reasoning, not just this artifact. |
| `targeted-tests-run.txt` | This step's own required fixtures (`tests/cli/dispatch.test.ts`, `tests/cli/materialize/BlueprintProjectMaterializer.test.ts`, `tests/cli/commands/ReplayCommand.test.ts`) still pass, run directly via Jest for the reason `npm-wrapper-repro.txt` demonstrates. |

None of these artifacts substitute for a real browser visual pass; they document a synced-checkout re-audit
(§6) and precisely why no fresh Studio/browser screenshot pass exists yet (§4), rather than asserting either
without evidence.
