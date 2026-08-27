# P8-04 independent fresh-profile authoring rerun

Product candidate: `cce79716790ae3cfc8d6f5c095fbc08426386e56`
Evidence descendant: `1d39d9eefe54be84c55adf483aac40ed7b6606de` (the candidate source tree differs only at this evidence path).

## Scope and provenance

Four fresh, isolated Studio/Chromium profile launches used exactly `node ./dist/cli/pokie.js --no-open` from this checkout. No `node_modules/.bin/pokie` executable was launched. Each isolated launch reached the public **Design Your Game** journey; the final launch used the candidate build, fresh HOME, fresh Chromium user-data directory, inherited controller display, and active-window verification.

## Rendered results

- Public guidance rendered: required `Game id`, `Game name`, and `Version`, with optional Description/Author; **Choose a different start** led to **Use the starter game**.
- After the visible `Game id` was cleared, Studio rendered the local actionable error `"manifest.id" must be a non-empty string.`; entering an ID and name rendered a valid design in 648--671 ms.
- The Layout tab rendered its destructive-change guidance. Reducing Reels from 5 to 4 showed `Reduce reels from 5 to 4?` and explicitly warned that custom paylines and reel definitions beyond reel 4 would be removed. **Cancel** restored the visible count to 5 and preserved five `Payline 1` cells. The second reduction's **Confirm** produced four visible reels and four cells, then field-specific, actionable validation reported four repairs.
- All four `A`, `K`, `Q`, and `J` `x5` payout row actions then disappeared immediately after their own visible clicks. The final rendered state was `Valid, with warnings — 1 warning(s).`; its warning was the actionable K-versus-Q reel-strip weighting/RTP warning, not an authoring error. Thus the former 120-second wait for the stricter `Valid — no issues found.` phrase was a harness readiness mismatch, not a product failure.

The final launch timings were: Studio listening 1379 ms, Chromium ready 479 ms, guided editor 298 ms, local Game-id validation 665 ms, corrected initial design 670 ms, destructive confirmation 62/28 ms, cancellation 266 ms, and confirmed post-reduction validation 700 ms. No rendered product error or console warning/error was observed. The only network diagnostics were two `GET /favicon.ico` 404 responses.

## Boundary and bounded diagnostics

The four-launch budget expired after the valid-with-warning state, before **Create game**, **Close project**, **Projects/Open**, and workspace continuation. Those outcomes were therefore not reached and are not represented as product failures. No profiles, project trees, automation source, raw logs, or generated artifacts are retained. Discarded final-launch bounded proof checksums:

- rendered destructive-confirmation PNG: `c81fd2a4ad317792435b95f73586a5ea7fab3cf81fe44400a6deba08d4ccfef8`
- rendered result JSON (events, console/network diagnostics, final visible text): `d31885b2e8e1dabbccc9643043f32fab647633a77090e242dfd21ddbc125f551`
