# P6-20 current candidate Studio rerun — inconclusive

Candidate SHA: `3b1881f28b6dc32899c5ac96ea96dc06eddab8c6`.
Companion checkout: clean at required SHA
`b7b043e0e722da917f1b60c4f107c8cc35fdd725` before and after the run.

`npm run build` completed successfully. Studio was then launched once from
this checkout with exactly `node ./dist/cli/pokie.js --no-open`; it announced
`http://127.0.0.1:3200`. A fresh Chrome profile opened that root and visibly
rendered Studio's **Design Game** page (not a product error).

Visible mouse/keyboard interaction opened **Projects**, entered the supplied
companion path, and completed **Detect → Register → Open**. Detect visibly
reported a Package, registration reported `pokie-examples`, and the delayed
Open action then rendered the **POKIE Examples Fixture Slot** workspace at
`#/project/%2Fhome%2Fstager%2FWork%2Fsta-ger%2Fpokie-examples/overview`, with
valid validation and the Play/Replay tabs.

The visible **Play** tab and seed detail were opened; `fixture-round` was
entered through browser keyboard input and **New Play session** was issued.
Immediately afterwards the browser DevTools connection became unavailable, so
the run could not observe a rendered session, Spin, Replay, or final Projects
recovery result. No rendered product error was observed. Per the verification
protocol, that driver interruption is inconclusive rather than a product
finding. No screenshot is retained because there is no rendered failure and
the concise record above is the complete bounded evidence.
