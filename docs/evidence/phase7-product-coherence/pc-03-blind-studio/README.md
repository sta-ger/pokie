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

## Fresh-profile completion pass

A second, newly isolated profile repeated the visible route on 2026-08-27
with the candidate rebuilt from this checkout. It used the same public Studio
launch, active inherited-Xvfb Chromium window, rendered labels, and public
README guidance; it retained no generated project, profile, screenshot, or raw
browser log.

The initial design screen visibly said that Studio was checking the game design
automatically. Selecting the starter settled at `Valid — no issues found.`;
Create game then created Starter Slot and showed its saved location, `Created
in Studio`, `Editable`, and local valid result. This covers the reachable
automatic loading/checking transition and its successful settlement.

Close project visibly reached Projects (not the still-mounted project tab).
The public list showed the newly saved Starter Slot as `Available`, with its
saved `blueprint.json` location and an exact `Open` action. In the separate
`Add a game you already have` route, entering `/definitely-not-a-pokie-project`
and choosing `Check game` produced the local actionable failure that the path
does not exist and can be corrected or chosen with Browse. The original saved
project's exact `Open` action then reopened Overview successfully. Thus both
the saved-project handoff and the visible open/import-check path were exercised
without fabricating an input project.

With the reopened workspace rendered, browser reload recovered Overview and
its `Close project` control. Selecting the visible `Game Model` tab, then
using browser Back and Forward, returned respectively to Overview and Game
Model. The final local diagnostic scan was empty. No stale-specific UI was
rendered after the failed-open/failed-check recovery, saved-project reopen,
reload, Back, or Forward paths; that state is therefore unavailable through the
publicly exercised route, rather than inferred from a timeout. No rendered
product failure was observed.
