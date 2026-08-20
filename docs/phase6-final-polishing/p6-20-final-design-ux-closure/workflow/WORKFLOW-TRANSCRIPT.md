# P6-20 independent workflow UX audit

**Audit state.** 2026-08-20, fresh Chromium profile, one public Studio launch from
the supplied worktree: `./node_modules/.bin/pokie --no-open`. The supplied checkout
was `7d0ceb7235561dfbb14ecf43820876d13c0c2fd4` (the request recorded
`6ee8bc9ddfac4845e1923d8b4cfef1e9ce8115d4`). The read-only companion checkout was
clean at its required `6bb67dee3d2e8e98bab754e1000019701a17266b` HEAD. No source,
documentation, prepared happy-path, or prior audit evidence was read.

## Natural interaction transcript

1. Opened the default **Design Your Game** screen. Question: what is the next
   action? The introductory copy and primary **Create Project** action answered it.
   I changed the default ID to `ux-audit-slot` and name to `UX Audit Slot`; automatic
   validation remained valid. [Create proof](screenshots/01-create-project.png)
2. Selected **Create Project**. Destination: the new project Overview, with a
   managed `blueprint.json` location, explicit capabilities, valid status, and a
   prominent next action to Play. [Overview proof](screenshots/02-workspace-overview.png)
3. Used **Game Model > Game basics > Edit**, added `First-time UI audit.` as the
   optional description, and selected **Save**. Save/Cancel were clear, and the
   project remained valid.
4. Used **Play > New Play session**. The initial disabled **Find symbol win** control
   explained that a symbol must be chosen. I spun once at the default 1.00 stake;
   the no-win result, reel grid, credits, wins, paylines, and round-inspection next
   step rendered. [Play proof](screenshots/03-play-round.png)
5. Used **Replay > Session Spin**, selected Session 1 / Round 1, and reviewed the
   loaded recorded result. It clearly separated a recorded live round from a fresh
   seeded replay and displayed stake 1.00 and completeness/exportability.
6. Used **Simulation** with its visible default of 10,000 rounds. It completed in
   0.9s and rendered RTP 102.98%, hit frequency 10.94%, volatility 3.75, max win
   36.00, a confidence interval, and the explicit no-seed reproducibility warning.
   [Simulation proof](screenshots/04-simulation.png)
7. Used **Build/Export > Generate outcome library (base)**; Studio reported 1,024
   outcomes at 100.78% RTP. The formerly blocked Stake control became available. I
   ran **Stake Engine Export (base)** and Studio reported four files exported to the
   project’s `stakeengine` directory. I then ran the visible default TypeScript Game
   Package **Build**, which reported its `tsPackage` destination. The build card
   exposes the local/headless limitation instead of silently opening an output.
   [Build proof](screenshots/05-build-stake.png)
8. Destructive-recovery and persistence check: selected **Close project**, then
   **Projects** to reopen the just-saved project. Dead end: at the rendered 1050px
   viewport, the table’s **Actions** column is beyond the right edge; the UX Audit
   Slot’s visible name and location are shown, but its **Open** control is not.
   A natural click on the visible project name did not reopen it. Keyboard Tab can
   reach an off-screen Open control, but this does not restore an evident mouse
   path. Destination: stayed on Projects. This blocks a normal first-time-user
   save/reopen completion and is recorded as P2.
   [Dead-end proof](screenshots/06-projects-reopen-dead-end.png)

## Finding

**P2 — Projects table hides the reopen actions at 1050px.** The Actions column is
laid out beyond the rendered viewport with no visible horizontal recovery affordance.
After Close project, a first-time user can see the saved project but not an obvious
mouse-reachable Open action; the visible project-name recovery attempt did not
navigate. This interrupts the save/reopen loop, despite all other audited workflow
surfaces being reachable.

## Screenshot checksums

| File | SHA-256 |
| --- | --- |
| `screenshots/01-create-project.png` | `699b581029fa6ae9ff3be00c2891f852e3be14c729156f5c818aa2a158e93190` |
| `screenshots/02-workspace-overview.png` | `b8aa5dfa09ec649353c88f5c99aacb6dc5d04395853976940e611f082a802a51` |
| `screenshots/03-play-round.png` | `6f575559d8b90524ea44bfb49e57a6b472d631a8a3da35bf8a7bb5fc99d6f949` |
| `screenshots/04-simulation.png` | `7afde4acb3f9fedda6e4071bd7fd6d96621cf3b6990621d6a7e2048613298f4a` |
| `screenshots/05-build-stake.png` | `9fa79e9fa5c14e81d8b77d126d76d47ce7fcb0c4008edb2d6ffb86972048f7a7` |
| `screenshots/06-projects-reopen-dead-end.png` | `7c31286eb2d2fac8c0a09345e9802b85f2048a1bd3e4d4aff3aa4bca267e1493` |
