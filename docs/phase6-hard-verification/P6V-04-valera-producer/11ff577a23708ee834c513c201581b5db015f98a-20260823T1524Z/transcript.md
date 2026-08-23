# P6V-04 bounded current-candidate recovery transcript

- Candidate SHA: `11ff577a23708ee834c513c201581b5db015f98a`.
- `git diff --name-only 11ff577a..HEAD` contained only this evidence; the
  rebuilt executable therefore used the candidate product source.
- `npm run build-cli` completed before the recovery launch. Each permitted
  launch used a newly created `POKIE_STUDIO_HOME` registry and Chrome
  `--user-data-dir`, and Studio was started from this checkout exactly as
  `node ./dist/cli/pokie.js --no-open`.

## Rendered checks completed

Each fresh recovery run created the managed Blueprint project and reopened it
from the rendered Projects list;
edited Game basics, Layout and a payline; visibly edited literal reel strips
(including a duplicate stack symbol); selected PNG artwork through the focused
native picker; marked A as scatter; added an A×3 paytable payout; and saved
each completed section. The repaired Free-games control lookup then read the
visible **Scatter symbol** control directly and confirmed its preselected
value was `A`.

## Bounded inconclusive point

Both recovery launches then visibly rendered **Bets & Modes** with an enabled
**Edit** button, but the browser driver could not semantically bind that
section-local action. No click was accepted and no product error was rendered.
This is an inconclusive selector result, not a product finding. The two-launch
limit prevents a further browser attempt. Consequently Bets/Modes persistence,
Mechanics save/reopen persistence, Play, Simulation, Replay JSON export, and
Build/Export are not claimed.

## Representative screenshot

| File | SHA-256 | Rendered proof |
| --- | --- | --- |
| `screenshots/artwork-picker-and-scatter.png` | `b2ddea087e97a9bd661d35bbd81ac14d4c3a1df114c0da41fc0d5fa2586d5fd5` | Selected PNG rendered as Change/Remove and A's Scatter control rendered checked. |

The retained evidence contains two text files and one 81,931-byte screenshot;
no browser profile, generated project, output tree, full log, or automation
source is retained.
