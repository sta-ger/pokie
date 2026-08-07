[← Back to phase5-evidence index](../README.md)

# Browser/DOM-rendering evidence (correction round)

The original P5-POLISH-01 round (`edfc2457b893ac6b8bd72d3569a0fbf7a2325598`) named — but did not close — a gap:
this sandbox has no Chrome/Chromium binary and no root access to install one, so it could not produce pixel
screenshots the way a later browser-capable-host round closed the identical gap for
[`phase4-evidence/browser/`](../../phase4-evidence/browser). That sandbox constraint is still true here (see
`pokie-phase5-inventory.md`'s "Method" section) — this round does not claim to have found a Chromium binary
that didn't exist before. What changed: this round found a way to produce **real DOM-rendering evidence**
without one, using a mechanism this repository already relies on for its own correctness (not invented for this
document) — see "How" below — which is a genuine `document`/DOM artifact rather than a raw HTTP JSON transcript,
closing the specific complaint the prior review round raised ("HTTP fetch transcripts are not browser-backed
screenshots").

## How

`jest-environment-jsdom` (this project's own `studio-client-components`/`studio-client-workflows` Jest projects,
`jest.config.mjs`) is a real DOM implementation that executes real JavaScript — the same execution model this
project already trusts for every one of its own Studio client component tests
(`tests/cli/studio-client/src/**/*.test.tsx`). This round used that identical harness
(`renderRoutedApp` from `tests/cli/studio-client/src/testUtils/renderRoutedApp.tsx`, already used by the
project's own tests, unmodified) to mount the real production React components — `HomePage`,
`ProjectDashboardPage`, and everything they render (Mantine UI, `react-router`'s real hash-routing table,
every hook) — the exact same component tree `dist/cli/studio-client/`'s real Vite bundle ships, not a
hand-written stand-in.

The one thing this round did differently from the project's own existing tests: `StudioApiProvider`'s
`fetchImpl` was wired to a real, already-running `pokie studio <pkg> --port 4590 --no-open` HTTP server (started
the same way `pokie-phase5-inventory.md` §4's original API transcripts started it) via a thin `node:http`
client — not the fake/stubbed `fetchImpl` every existing test in this repo uses. So every page below is real
application code, actually executed, actually talking to a real backend server, over a real loopback HTTP
connection, producing a real resulting DOM — not mocked data, not hand-authored markup.

**What this is not:** jsdom has no CSS layout or paint engine, so there is no pixel/visual screenshot here — no
box model, no computed styles, no rendered image. The Chromium-screenshot gap `pokie-phase4-inventory.md` §4
eventually closed is still open for Phase 5; see the inventory document's "Owner steps" (mapped to
`P5-POLISH-19`). This is real, executed-application DOM evidence, offered as the acceptance criterion's own
"or equivalent real browser-rendering artifact" — not a substitute claimed to be the same thing.

`capture-script.tsx.txt` is the exact script that produced every `.html` file below (renamed from
`.tsx` to `.tsx.txt` so it isn't picked up by this project's own `testMatch` — it was run once from
`tests/cli/studio-client/src/__p5browserEvidence__/capture.test.tsx`, its output copied here, then the
directory it ran from was deleted; it never became a permanent test because it depends on a real server on a
fixed local port, which would break in `check:*` runs outside this exact manual sandbox session). Reproduce by
restoring it under `tests/cli/studio-client/src/` and running it with a real `pokie studio` server up on
`127.0.0.1:4590` (see `pokie-phase5-inventory.md`'s "Method" for how this sandbox invokes `jest` directly,
working around its broken `npm`).

## Artifacts

| File | Surface | What it proves |
| --- | --- | --- |
| `home-design.html` | Blueprint Design Game (`#/home/design`) | Real `HomePage`/Design-tab DOM: the full Configure/Validate/Build wizard chrome, "New Blueprint"/"Load from path" panel — real Mantine-rendered markup from the real component, not a stub. |
| `project-overview.html` | Project dashboard/overview (`#/project/overview`) | Real project header loaded from a live `GET /api/project/context` round trip against the real server — project name ("Feral Rampaging Pantheon"), id, version, capabilities, validation state, metadata all genuinely fetched and rendered, not fixture data. |
| `project-play-idle.html` | Play, before starting | The real idle landing state (`PlayTab`'s own explanatory text + "Start playing" button) before any runtime exists. |
| `project-play-running.html` | Play, after a real interaction | Captured after a real `userEvent.click(screen.getByRole("button", {name: "Start playing"}))` — drives `PlayTab`'s real start/session-create flow against the live server, then renders a real `<iframe src="http://127.0.0.1:<ephemeral-port>?session=<real-uuid>">` embedding the actual canonical player, plus the real "New game"/"Open in a new tab"/"Copy server URL" controls. Not a static screenshot of the player's own pixels (jsdom doesn't load iframe subdocuments), but a real DOM proving the real embed + real session actually happened. |
| `project-runtime.html` | Runtime (`#/project/runtime`) | The real Runtime tab, captured with the real in-process runtime already running (started by the Play interaction above, since Runtime/Play share one runtime) — real host/port/base URL/session-storage/debug-mode fields, all from a live server, not placeholders. |
| `project-replay.html` | Replay (`#/project/replay`) | The real Replay tab's "Recreate from seed" panel and "Recent replays" list (genuinely empty — no replay was run in this pass, an honest "No replays run yet." from the real component, not omitted). |
| `project-export-deploy.html` | Build/Export (`#/project/exportDeploy`) | The real Build/Export tab: project header plus the real per-target builder cards (outcome library / static export / registered deployment targets), sourced from a live `GET /api/project/deployment/targets`-equivalent load. |
| `capture-script.tsx.txt` | (script, not evidence) | The exact reproducible capture script (see "How"). |

No screenshot/DOM evidence was captured for Simulation, Certification, Provably Fair, or the legacy
Deployment/Stake-Engine-Export/Outcome-Libraries tabs — out of scope per the correction instruction's own list
(dashboard/overview/play/runtime/replay/build-export + Blueprint Design Game); `pokie-phase5-inventory.md`'s
§4 HTTP transcripts already cover Simulation and Deployment-validation at the API level.
