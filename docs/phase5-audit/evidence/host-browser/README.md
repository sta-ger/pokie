# External host-browser action record — 2026-08-09

This evidence was captured outside the implementer container with `/usr/bin/google-chrome`
(`Google Chrome 138.0.7204.183`) against the freshly compiled P5-POLISH-20 task clone. It is intentionally
separate from the container's earlier environment proof: the container's inability to run Chromium remains
true and is not represented as a product failure.

## Environment and actions actually performed

The host started the real Studio server with:

```sh
node dist/cli/pokie.js studio \
  docs/phase5-evidence/p5-polish-19/parity/after-fix-fixture-blueprint.json \
  --port 4100 --no-open
```

Chrome then loaded `#/project/play`. Via the rendered controls, the audit clicked **New session** and
**Find any win**. The resulting player rendered a settled winning RoundArtifact. It then navigated via
the rendered **Replay** navigation, selected the rendered **Session Spin** control, and verified the recorded
round was listed immediately. These are browser UI actions through Chrome DevTools Protocol; no Studio product
endpoint was called directly to substitute for a click.

The same live Studio instance was then rendered at Game Model, Simulation, and Build/Export routes. The images
are ordinary Chrome pixel screenshots, not jsdom output:

| Evidence | Observation | SHA-256 |
| --- | --- | --- |
| `01-mathematician-play-find-any-win.png` | Standalone Player shows the found RoundArtifact and its win details. | `98d5b0c79e13f6313f5b133c3e30bb38754d81aa2dc0d6e0281417b455216164` |
| `02-qa-replay-session-spin.png` | Session Spin contains the immediately recorded Play round. | `c432d57fed27488ea45d8ae59773c6b7ef869e45e41b3412a1aec49da3fd11cd` |
| `03-designer-game-model.png` | Game Model presents the fixture's model and Reels view. | `4b70a7599cc13cdf9b767ad3ad37e43e85db1c849282e0e9cb2ed5574dbebf70` |
| `04-designer-simulation.png` | Capability-driven Simulation surface is available to the Blueprint project. | `3f449215dd7110e9e2f813c25d9ac20d1bd3cdcffaf09bede3b4bc7c0fde07ac` |
| `05-integration-build-export.png` | Build/Export is one project workspace section; there is no standalone deployment route. | `745eacb1524815621d1fd48cb0d90e19863b7ff5837913f608e1f5b279697405` |

The audit also opened the rendered **Projects** page and used the normal Location/Detect import form with the
Blueprint fixture path. A first unscoped synthetic input attempt did not advance and was not counted. The
subsequent action used the Location control associated with its rendered label, dispatched native browser input
and change events, clicked **Detect**, and then clicked the rendered **Register** control. Studio detected the
Blueprint and registered `after-fix-fixture-blueprint` in **Your projects**:

| Evidence | Observation | SHA-256 |
| --- | --- | --- |
| `06-project-import-blueprint.png` | Projects → Detect → Register, with the registered Blueprint table row. | `e43137cf90052c76cf2e887aaed8ea6053bb4786ee002c4ce6e96e30c2b423f3` |
| `07-qa-malformed-import.png` | Projects → Detect on `/definitely/not/a/pokie/project`; user-facing “doesn't exist” and unrecognized-project diagnostics. | `8d4a4c1716691f41bd9c32f1821b1713c865745849d9a0cde2e561f633870892` |

The existing CLI/API persona transcripts remain the evidence for package/outcome imports and developer CLI
workflows; this file only claims the host-browser actions explicitly listed above.

The host browser also opened **Game Model**, clicked the first section's rendered **Edit** action and verified
the section changed to its Save/Cancel form, then navigated to **Simulation** and clicked **Run Simulation**.
These actions exercised the rendered Studio controls rather than invoking a backend operation directly:

| Evidence | Observation | SHA-256 |
| --- | --- | --- |
| `08-blueprint-edit-mode.png` | Editable Blueprint's Game basics section in actual Edit mode, with Save and Cancel controls. | `e6e3cac85da969ad1695ca4deb6be127528284ae519d4d19fb8ce23f02da6391` |
| `09-simulation-run.png` | Simulation route after the rendered Run Simulation action. | `fa872021c450364b1963fc62196371ef3d057451f2834530c896fba2cc6a7631` |

## Audit consequence

The player-to-recorder-to-Replay journey is reproducible in the real browser and the screenshots are retained
as external evidence. This file does not claim that the remaining persona browser journeys were completed; they
must be extended before the P5-POLISH-20 hard gate can be accepted.

## F9 Blueprint import-and-open completion — 2026-08-10

[`f9-rerun-20260810/`](f9-rerun-20260810/) is the current external-browser evidence for finding
`legacy-37e8e5b75ba7`. A freshly built Studio used an isolated registry; an external Chrome session entered the
Blueprint fixture path through the visible Location input, clicked **Detect**, **Register**, and the Blueprint
row's visible **Open** button, then clicked **Game Model** after arrival in the opened workspace. The run saved
pixel screenshots, extracted visible text, an action transcript, and fresh-build/Studio/browser terminal logs.
It supersedes the old pre-fix `import-rerun-fb1e22e-rerun6-clean/` record for this narrow workflow.
