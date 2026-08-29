# PC-12 player-parity browser evidence

The independent verifier is `scripts/pc-12-player-parity-browser.mjs`.  It starts the built public
Studio entry point and the real `pokie-examples` fixture page, drives their visible controls, and crops
only `[data-pokie-player="canonical-v1"]` before comparing the canonical player contract.

Run it with `PC_12_STUDIO_PROJECT` pointing at the deterministic same-game fixture package and
`POKIE_EXAMPLES_PATH` pointing at the companion checkout.  The fixture must expose the real `Win` and
`Free games` scenarios. Its uncommitted `current-run/` output records the fixture identity and seed,
viewport dimensions, cropped desktop/mobile screenshots, checksums, pixel-difference result, DOM/semantic,
computed-style/layout and overflow comparisons, plus the browser transcript. The workflow also records the
hover/highlight restoration, selectable controls, feature result, Inspector disclosure and Studio recovery
checks. The runner always removes its temporary Chromium profile and child processes, including failures and
cancellation; only this README is retained as the campaign's evidence convention.
