# P8-02 onboarding evidence

Independent final rerun on candidate `6215d485251dabb8a8aec0e87cd7edca8bb16518`
used the checkout build with `node ./dist/cli/pokie.js --no-open` and newly
isolated Studio/Chromium profiles. Rendered evidence confirms the first-launch
purpose, invalid-location recovery, all four start choices, and workspace
arrival.

The browser intercepted the public workflow's legacy project-context 503,
scoped project-opening 500, and launch-context 503. Each project-opening
failure visibly exposed **Go to Your projects**. Keyboard focus reached that
actual rendered control; Enter left it unchanged, so one safe Space-key retry
on the still-focused control reached `#/home/projects` in each case. No
`/api/projects/close` request was observed. The transcript records those route
transitions, intercepts, and console result; the seven small screenshots retain
only the representative visible states. Superseded evidence is replaced in
place.
