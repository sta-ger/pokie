# PC-12 player-parity browser evidence

The independent verifier is `scripts/pc-12-player-parity-browser.mjs`.  It starts the built public
Studio entry point and the real `pokie-examples` fixture page, drives their visible controls, and crops
only `[data-pokie-player="canonical-v1"]` before comparing the canonical player contract.

Run it with `PC_12_STUDIO_PROJECT` pointing at the deterministic same-game fixture package and
`POKIE_EXAMPLES_PATH` pointing at the companion checkout.  Its `current-run/` output records the fixture
identity and seed, viewport dimensions, cropped desktop/mobile screenshots, checksums, comparison result,
and a browser transcript.  The runner always removes its temporary Chromium profile and child processes.
