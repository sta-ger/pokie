# P6-20 current candidate Studio rerun — passed

Candidate source: `3b1881f28b6dc32899c5ac96ea96dc06eddab8c6`.
This evidence-only descendant changes no candidate source: its sole prior delta
was this verification record. The companion `pokie-examples` checkout was clean
at required SHA `b7b043e0e722da917f1b60c4f107c8cc35fdd725` before and after.

`npm run build` passed. Fresh-profile Chrome then opened the candidate Studio
launched exactly with `node ./dist/cli/pokie.js --no-open`, at its announced
root `http://127.0.0.1:3200`. Once the server had finished becoming ready, the
rendered root was Studio's **Design Your Game** screen; no product error was
rendered.

Using visible controls only, the rerun completed:

1. **Projects → Open** opened registered `POKIE Examples Fixture Slot` from the
   required companion path; the workspace rendered valid validation and the
   Play/Replay sections.
2. **Play** → advanced seed → entered `fixture-round` → **New Play session** →
   **Spin** rendered `Round complete`, `You won 5.00`, the expected 3×3 symbol
   grid, and the round artifact inspector.
3. **Replay** → **Session Spin** → selected its rendered Session 1 / Round 1
   record. Studio rendered `Loaded replay`, source `Recorded -- Play tab spin`,
   seed `fixture-round`, full completeness, and the round inspector.
4. **Close project** → **Projects** → **Open** returned to the Fixture Slot
   Overview with `Close project`, valid validation, and in-process Play/Replay
   capability; no dead end occurred.

One representative screenshot records that final visible recovery state:
`02-projects-open-recovery.png` — SHA-256
`5290d6bba76bec1023054ad260bd7f2e94a40a029d12639b65f03b9f87a30626`
(86,871 bytes). No generated projects, profiles, logs, or automation are
retained.
