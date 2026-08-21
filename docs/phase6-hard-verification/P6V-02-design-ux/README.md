# P6V-02 independent rendered verification — passed

Candidate: `976d9d887a6c02ce506c501e3cf38e40f38820e3`  
Candidate CLI: `dist/cli/pokie.js`  
SHA-256: `4643f200188d379630754512e8466ec7339bb715f44753ba9675e9e0f3e86495`

## Bounded transcript

1. Built the exact candidate, then invoked the specified public CLI entry point
   with `--no-open`.  With no subcommand it printed its public command help and
   exited successfully; it did not start Studio.
2. For the permitted readiness preflight, created an isolated playable package
   outside the worktree whose sole `pokie` dependency was a one-time package of
   this candidate build.  It was launched through the candidate CLI as
   `node ./dist/cli/pokie.js dev <isolated-package> --no-open`.
3. The public CLI reported a listening game API and a listening **client UI**.
   A fresh browser profile rendered the following visible product surface:

   ```text
   Playable Game — POKIE client
   Connected to http://127.0.0.1:38981
   Session seed (optional) | Start new session | Restore session
   Bet 1 | Credits 1000 | Spin | Raw response
   ```

   There was no rendered Studio navigation or route to Home, Design Game,
   Projects, Game Model, Reel Strip Modeler, Simulation, Replay, Build/Export,
   or Outcome Library.  Public probes of `/studio-client/`,
   `/studio-client/index.html`, and `/client/` on the launched client server all
   returned HTTP 404.

## Initial result

The required Studio readiness surface was initially not reachable through the
prescribed candidate public launch. No product error was rendered and no
product code or tests were changed. Later recovery attempts below reached the
Studio matrix and cold-start exploration; this preserves the initial
environment observation only.

## Harness-recovery continuation (2026-08-21)

The candidate was rebuilt successfully from the evidence descendant; its only
delta from `976d9d887a6c02ce506c501e3cf38e40f38820e3` is this evidence file.
The prescribed launch, `node ./dist/cli/pokie.js --no-open`, then rendered
`POKIE Studio listening on http://127.0.0.1:3200`.

With an isolated browser profile the public Studio UI rendered Design Game and
the recommended `Starter Slot`. `Create Project` opened Workspace, and a fresh
profile automatically reopened that saved project. The rendered Workspace
included Game Model, Play, Simulation, Replay, and Build/Export navigation.

Rendered functional observations:

1. Play required the visible `New Play session` control before its `Spin`
   control became available. One Spin completed normally: `Round complete —
   no win this round`, with credits `999` and total win `0.00`.
2. Simulation rendered its Configure/Run/Review/Export flow. The visible
   rounds input was changed through normal keyboard input to `1`; one
   `Run Simulation` action was accepted and rendered `queued — 0/1 rounds`.
   No product error rendered before the browser-driver session ended, so it is
   pending rather than a failure.

This recovery established Studio readiness and the bounded create/reopen/Play
path, but did not complete the required all-surfaces visual matrix, the
separate uncoached cold-start audit, Replay, Build/Export, Outcome Library,
Stake export, or the approximately 405px review. No P0/P1/material-P2 product
defect was confirmed in the reached rendered surfaces.

## Harness-recovery attempt 2 (2026-08-21)

The rebuilt source is candidate `976d9d887a6c02ce506c501e3cf38e40f38820e3`;
the checked-out evidence descendant differs only in this directory. Two fresh
public Studio launches used exactly `node ./dist/cli/pokie.js --no-open`.

### Rendered preflight matrix

| Surface / state | Rendered observation |
| --- | --- |
| Design Game / desktop | Recommended `Starter Slot`, all six valid model sections, and Create Project rendered. |
| Projects / saved reopen | The created managed Blueprint appeared and reopened into Workspace. |
| Game Model | Game basics, Layout, Symbols, Reels, Paytable, Bets & Modes, Mechanics, Limits, Game window, and Full strips rendered. All five literal strips and their stops were visible. |
| Play / success | `New Play session` then one `Spin` rendered `Round complete — no win this round`, credits 999, and Inspect round artifact. |
| Simulation / empty, running, warning, success | Empty list rendered first; a submitted run progressed and later completed 100001/100001 rounds with RTP 101.93% and the visible unseeded-run reproducibility warning. |
| Replay / success | A fresh round-1 replay completed with a captured, inspectable, exportable artifact. |
| Build/Export / loading, success, disabled | Exact Outcome Library generation reported 1,024 outcomes (RTP 100.78%); Stake Engine Export reported four files. The unavailable PAR/WASM/remote targets rendered their explanations. |
| 405px | Build/Export remained rendered at 405px, including success feedback and unavailable states. |

The preflight had no rendered P0, P1, or material-P2 product error. A fixed
driver wait during Simulation was followed by its rendered success and is not
recorded as a defect.

### Separate cold-start exploration

In a second fresh browser profile, without opening docs, source, prior evidence,
or an audit script, the one-sentence task “make and try a slot game” was driven
only through rendered controls: **Design Game → Create Project → Overview →
Open Play**. The workspace navigation and the explicit `New Play session` CTA
were discoverable and the hierarchy/terminology matched that goal.

### Remaining boundary

At the end of this second attempt, the native-host-picker, rendered-error, and
editable-Modeler surfaces remained incomplete. The next recovery attempt below
continued those specific gaps.

## Harness-recovery attempt 3 (2026-08-21)

One further fresh exact-candidate Studio launch reused the existing public
workflow and browser profile only to cover the prior gaps; no already-passing
test command or viewport was repeated.

1. **Reel Strip Modeler:** Design Game → Reels → Per-reel (Reel Strip
   Modeler) rendered the five-reel selector. The visible Reel 1 **Select**
   action enabled **Configure**, **Done**, and Preview; Configure rendered the
   editable Literal/Generated controls, Copy, Add symbol, Preview, and the
   explicit **UNAPPLIED CHANGES** state. Validation returned `Valid — no
   issues found.`
2. **Artwork picker/error feedback:** Design Game → Symbols → visible
   **Select PNG** was invoked normally. Instead of a silent no-op, Studio
   rendered `No graphical display was detected on the machine running Studio's
   server (DISPLAY/WAYLAND_DISPLAY is not set).` The server host therefore
   could not open an OS-native picker for this headless verification machine.

This closed the Modeler and rendered-error-state gaps. At that time an actual
native host picker was unrenderable without a graphical server; attempt 4
below resolves that coverage boundary.

### Minimal screenshots

| File | SHA-256 | Coverage |
| --- | --- | --- |
| `design-desktop.png` | `ff943e2841ee8ca3727b83a8dfb9ff42094ce5418ddfc6abc2774d5184c70587` | Recommended model / desktop entry. |
| `replay-desktop.png` | `756fc4a190c7db1fcd981a4ae66e93ec7522a56cc4de2ae290eac089dd48a195` | Completed replay artifact. |
| `build-mobile-405.png` | `19e2d352cacc3222c3bb39419a4e547631802686bee871a8e321cad68b53e6d4` | Build/Export success, disabled states, approximately 405px. |
| `cold-start-play.png` | `a5d7c1f8310679ceda1d58f7208662d9d548f2b897225021b1c70bfa4ae1bd0d` | Separate cold-start Play discovery. |
| `reel-strip-modeler.png` | `13658a08f215743673f0175ec1bb2d0fc4ab75de7103d1ebcc213405ed98ff1e` | Editable Reel 1 configuration and un-applied-change state. |

## Harness-recovery attempt 4 (2026-08-21) — native-picker closure

One fresh profile and one further public Studio launch used exactly
`node ./dist/cli/pokie.js --no-open`; the candidate CLI checksum remained
`4643f200188d379630754512e8466ec7339bb715f44753ba9675e9e0f3e86495`.
The host's available virtual graphical display allowed the previously blocked
native path to be observed without altering Studio state:

1. Design Game → Symbols rendered normally.
2. A single visible **Select PNG** click for Symbol 1 opened the real native
   host picker (`zenity`): its visible Recent/Home/Desktop/Documents locations,
   PNG-image filter, and Cancel/OK controls were rendered.
3. One visible Cancel action returned to Symbols. No artwork or other model
   field changed, and no rendered product error appeared.

No P0, P1, or material P2 defect was observed in this final coverage branch.
The exact-candidate surface matrix, separate rendered-only cold-start audit,
transcript, and six representative checksummed screenshots now satisfy the
requested approval evidence.

### Added representative screenshot

| File | SHA-256 | Coverage |
| --- | --- | --- |
| `native-png-picker.png` | `dea6adc6b1039d92012a67c4a738ebaf1b413be5b1d57dfab82dfea52a54f8d8` | Real host-native PNG picker opened by rendered Studio control. |
