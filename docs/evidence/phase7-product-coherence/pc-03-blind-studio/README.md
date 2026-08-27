# PC-03 — blind Studio recovery ledger

Candidate: `a2083eb4d433fd52e42ad32ae1725bdd070d08c1`.

## Method

On 2026-08-27, a newly isolated Studio home, registry, and Chromium profile
launched this checkout with exactly:

```sh
node ./dist/cli/pokie.js --no-open
```

The browser opened the public listener at `http://127.0.0.1:3200` in a
mapped, active inherited-Xvfb window. The exploration used rendered Studio
labels, browser pointer/keyboard input, and the public README Studio tour; it
did not use private API calls, routes, application state, source-guided
navigation, or fabricated project files. All temporary profiles and generated
projects were removed after the run. No visual artifact is retained: the
bounded observations below are the smallest useful proof.

## Rendered observations

Fresh Design Your Game → Choose a different start offered Use the starter
game, Start with a blank game, Generate a game idea, and Open a saved game
design. That last action rendered a Saved game design field, Browse…, Back,
and Open saved game design.

Entering a nonexistent location and choosing Open saved game design produced
a local actionable failure: `/definitely-not-a-pokie-project` does not exist,
the path can be corrected or Browse used, and the saved design could not be
found. Back returned the visible start choices; the failed-open panel was no
longer pending or stale.

Use the starter game showed `Replaced the current game design.` followed by
automatic validation. The rendered checking state settled at `Valid — no
issues found.` Create game after that local valid state opened a saved
workspace for Starter Slot, with a visible isolated project location, `Added
to Studio Created in Studio`, `Editable — you can change this game in Studio.`,
Close project, and `Valid — no issues found.`

## Remaining boundary

The fresh-profile run reached a real saved-project workspace and the
saved-design open error/recovery route. It did not establish the saved-project
Close → Projects → Open handoff, browser reload, Back, Forward, or a
stale-specific state: the recovery harness used an overly broad `Open` matcher
that accepted the already-rendered Open Play control immediately after it
clicked Close project. Thus it did not confirm a Projects transition and made
no further duplicate or speculative action. There was no rendered product
error for project creation, and no stale state was publicly reached. This is a
bounded driver/selector limitation, not a product finding.
