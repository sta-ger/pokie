# P6V-03 independent browser recovery — driver inconclusive

Candidate product: `5c334cf5657dca2f7235d6275a5f78ad7e9f3274`. The checkout was rebuilt and launched only with `node ./dist/cli/pokie.js --no-open`; its current evidence-only ancestor has no product-source changes relative to that candidate.

The retained corrected run was verified before recovery: its transcript checksum is `112716092c04d90417d5924d4339f7cc2660069bccb7ed46d8a61bddb9fd4b8c`, matching the prior README. That run reached the rendered generated-Reel-1 preview after selecting artwork with the native picker, but neither rendered success nor error appeared within its bounded wait.

This recovery used the two permitted fresh visible Studio launches. Both reached the rendered **Select PNG** action. The first did not return the rendered artwork state after the native-picker interaction; the second stopped when the display's window manager rejected the driver's `_NET_ACTIVE_WINDOW` query before a picker keystroke could be confirmed. Neither launch rendered a Studio product error, emitted a duplicate generation/save request, or reached the prior pending Preview state. This is driver-inconclusive under the request contract, not a product finding.

Only the concise rendered-action recovery record is retained in `ACTION-TRANSCRIPT.txt`; temporary registries, Chrome profiles, Studio processes, automation, and generated projects/output were removed. Current checksum: `ACTION-TRANSCRIPT.txt` — `b204d3ac941601157b149cc8fc48de9d29334c36c128b50f25884152b46e77da`.
