# PC-19 recovery run — 2026-09-07T18:35Z

- Candidate source: `169c80f839758285d02de55eb72008e750e48a53`
- Candidate evidence descendant: `ce0757f80b8b8d6ac2d50abd5345909041669c8f`
- Installed package digest: `414fa8e93ca1c93a02b2268925fa4ab5e45ba06e540d12372f1d8d4633c98543`
- Public launcher: `node ./dist/cli/pokie.js --no-open`
- Fresh contexts: a new `POKIE_STUDIO_HOME` and Chromium profile below the verifier-owned harness run directory
- Harness transcript SHA-256: `fd2f89c5afe6f4951aceb5b0ae11217df4d0bb2c087fa4ecfd2fecfafda2f1a0`

## Rendered transcript excerpt

1. In a fresh Studio profile, one enabled `Create game` activation rendered its saved-workspace transition. One `New Play session` activation then exposed `Spin`; one `Spin` activation rendered a completed winning round.
2. One `Run Simulation` activation rendered its accepted `queued` and `running` states and its own completed result (RTP, report, and a recorded 10,000-round run). One `Open full report` activation rendered its detailed report.
3. Replay rendered its `Session Spin` source. One visible source selection rendered the next Session Spin choice state, but the browser driver could not locate an activatable choice control for that selected source. It rendered no product error.
4. No additional action was sent. The harness therefore did not reach Outcome Library generation, package build/open, sibling-bundle fairness Configure/Generate/Verify, remaining role missions, or parity review in this invocation.

## Frozen finding set

No product finding was observed in this bounded fresh-profile run. The incomplete Replay transition is a driver-correlation limitation: the rendered source-selection transition succeeded, but its next control could not be located by the driver and no action-local terminal error was rendered. This partial record is not a PASS and no post-freeze comparison was opened.

The raw browser profile, generated project/output tree, screenshot (none reached before the bounded stop), and full transcript remain outside review evidence. This record retains the candidate binding and transcript checksum only.
