# P8-03 fresh-profile Studio navigation verification

Candidate SHA: `4b06907f272ed1b9a47e719980ae71372a64c27e`.

The retained fresh-profile run launched this checkout with
`node ./dist/cli/pokie.js --no-open`, using isolated Studio and Chromium profiles.
It proved the scoped project, guarded-close cancellation, and the unavailable
Certification recovery surface. The visible `Go to Overview` action remained rendered
after a semantic wait; one safe physical retry from the verified active Chromium window
also produced no local success or rendered product error. A bounded console diagnostic
is recorded in the transcript. Build/Export was therefore not reached. This is
readiness-inconclusive evidence, not a product finding.

Superseded attempt evidence, browser profiles, screenshots, generated project state,
and full logs were removed. The retained payload is one concise transcript.

Checksum:

- `ACTION-TRANSCRIPT.txt = fdd48b7dba9ad93effb366b6da66176e111f9b65730c78646a9f87283b481f08`
