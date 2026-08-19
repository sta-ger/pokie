# P6-19 independent host Studio rerun

Candidate `10a5b0d6a59a1848d573f0219425df2b5d919bcd` was exercised in a visible local Chrome session against the public Studio UI with Node `v24.18.0` (the supported declared Node 24 runtime). This evidence contains no generated project/output tree.

## Browser transcript

1. In **Design Game**, created and saved the default Recommended Blueprint. In **Projects**, closed it and used **Open** to reopen its Workspace.
2. In **Game Model**, selected a PNG through the visible **Select PNG** control for symbol `A`, saved it, opened **Full strips**, and inspected the five literal reels. Reels 3--5 showed their authored `2x` stacks.
3. In **Bets & Modes**, changed the understandable third available bet from `5` to `10` and saved. The Workspace then displayed `Available bets: 1, 2, 10` and `Bet range: 1 - 10`.
4. In **Play**, started a session and spun one round: `Round complete`, win `12.00` (`12.00x` stake).
5. In **Simulation**, set rounds to `1` and ran it to completion (the UI reported `1/1 rounds`; its expected low-round warnings were visible).
6. In **Replay**, chose **Session Spin** and loaded the recorded Play-tab round. The inspector marked it `Full`, `Inspectable AVAILABLE`, and `Exportable AVAILABLE`.
7. In **Build/Export**, generated the base outcome library (`1,024` outcomes; UI RTP `100.78%`) and then ran **Stake Engine Export (base)**. The UI confirmed `Exported 4 file(s)`.

## Cold-start note

The first local launch showed Studio's explicit message that native PNG selection needs a graphical display when its server has neither `DISPLAY` nor `WAYLAND_DISPLAY`. The host UI run was restarted once with the visible X display supplied; the native picker completed and the artwork persisted. This is recorded as a host launch prerequisite, not a product failure in the completed visible-local workflow.

## Checksums of uncommitted generated outputs

The generated project lived outside the repository at `/home/stager/Documents/POKIE Projects/starter-slot-4` and is deliberately not committed.

| File | SHA-256 |
| --- | --- |
| `blueprint.json` | `94c534b0b014ccd206bf012ba5a4232eb1ba1084dbaffe5059195528a364412e` |
| `outcomelibrary/manifest.json` | `fce7ae8e700f8bf77b694200a04ad396962b5f83e3a031d0cf19f085409044de` |
| `stakeengine/index.json` | `57e19f4de9b88cc3e45e7a5a2f11e0940b465ff9e09a5e1553d58b384807a5d5` |
| `stakeengine/pokie-manifest.json` | `157fe5456534c0280d2243eed858fe99b9fbc4d39550e54514ae41680eb5c8f8` |
