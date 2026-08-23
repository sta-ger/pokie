# P6V-04 bounded current-candidate rerun transcript

- Candidate SHA: `11ff577a23708ee834c513c201581b5db015f98a`
- Executable rebuilt in this checkout with `npm run build-cli` before launch.
- Each of the two permitted attempts used a newly created `POKIE_STUDIO_HOME`
  registry and Chrome `--user-data-dir` profile, then launched exactly
  `node ./dist/cli/pokie.js --no-open` from this source checkout.

## Rendered progress

Both attempts reached the fresh valid Design Game form, created and reopened
the managed Blueprint project, opened Game Model, visibly edited literal reel
strips, selected `/usr/share/pixmaps/debian-logo.png` through the active
native picker, marked A as the scatter symbol, and saved the Symbols editor.
The rendered editor changed the selected artwork control to **Change** and
**Remove**. The first representative screenshot was captured before save;
the subsequent rendered transition into Bets and then Mechanics confirms that
the UI accepted the Symbols save.

The run then added bet 10 and a visible bet mode, saved them, opened
Mechanics, and clicked the rendered **Add free games** control. No product
error was rendered.

## Bounded inconclusive point

The retry repaired the first attempt's generic combobox lookup to target only
the rendered **Scatter symbol** combobox. After choosing visible option A,
the driver could not confirm the selector's committed value. The same
selector condition failed on the repaired second fresh launch. This is a
driver/selector limitation, not a rendered product error or a product
finding. No additional Studio launch was made, in accordance with the
two-launch limit.

Consequently Mechanics save/reopen persistence, Play, Simulation, Replay JSON
export, TypeScript package Build, outcome-library generation, and Stake Engine
Export were not reached and are not claimed.

## Representative screenshot

| File | SHA-256 | Rendered proof |
| --- | --- | --- |
| `screenshots/artwork-picker-and-scatter.png` | `b2ddea087e97a9bd661d35bbd81ac14d4c3a1df114c0da41fc0d5fa2586d5fd5` | Selected PNG shown as Change/Remove; A's Scatter control checked. |

The retained evidence contains two text files and one 81,931-byte screenshot;
no browser profile, generated project, output tree, full log, or automation
source is retained.
