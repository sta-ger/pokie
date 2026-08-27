# P8-02 onboarding evidence

Independent final rerun on candidate `6215d485251dabb8a8aec0e87cd7edca8bb16518`
used the checkout build with `node ./dist/cli/pokie.js --no-open` and newly
isolated Studio/Chromium profiles. Rendered evidence confirms the first-launch
purpose, invalid-location recovery, all four start choices, and workspace
arrival. It also captures the rendered legacy project-opening HTTP recovery.

The run is driver-inconclusive for the remaining recovery checks: after the
visible **Go to Your projects** button was keyboard-focused and Enter was sent,
no rendered route transition or product error appeared within the bounded
wait. This is not recorded as a product finding. Superseded screenshots and
provenance from the earlier candidate were removed.
