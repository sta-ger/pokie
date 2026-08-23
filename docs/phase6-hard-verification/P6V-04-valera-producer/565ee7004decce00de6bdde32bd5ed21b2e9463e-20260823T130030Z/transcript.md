# P6V-04 fresh rendered producer rerun

Candidate: `565ee7004decce00de6bdde32bd5ed21b2e9463e`.

Fresh Studio registry/home and Chrome profile. Product launch: `HOME=/tmp/p6v04-rerun-home-565ee700-20260823T124631Z node ./dist/cli/pokie.js --no-open`.

## Confirmed rendered UI results

- Created the valid default Blueprint and inspected its visible 5×3 layout, 3 paylines, symbols A/K/Q/J, literal reels, paytable and bets.
- Used the rendered fallback **Server filesystem browser** after the PNG control. It explicitly stated: `Select PNG artwork — showing files on the machine running Studio's server, not this browser's device.` A visible PNG was selected; the Symbols form changed from `Select PNG` to `Change` / `Remove` for A. Saved it. The persisted Model view showed A with its artwork.
- Closed the project, found its Available Project card, and reopened it.
- Exact Outcome Library generation and Stake Engine export controls were activated through the rendered Build/Export UI.
- A Simulation run was activated from its visible UI.

## Incomplete

This rerun did not complete the Play/Replay evidence chain. Replay's rendered **Session Spin** tab stated: `No spins recorded yet in this Studio session — play a round in the Play tab first.` Thus no Replay JSON export was available in this attempt. TypeScript package Build final success was also not re-checked after this fresh run.

## Checksums

| File | SHA-256 |
| --- | --- |
| `artwork-fallback-selected.png` | `2a892e05949995127d33693bdf27e85951adccfad63b1324f7653ae749fbc4e6` |
| `artwork-persisted-before-close.png` | `56f66d6e3a69dd96123ce6ad1fd7a2d845ff6ed138251e336dffe27f7fdbd899` |
| `final-state.png` | `46cb2d61025faaf0f251a5808c46b0f7ec848ce50e87e3646aaf59b0756f1a9c` |
