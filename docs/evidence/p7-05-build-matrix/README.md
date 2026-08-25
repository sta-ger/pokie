# P7-05 independent current-candidate verification — finding

Candidate: `e1383bdacda13ef4f6ea0e4716a771e973e50b5a`.

The required single command named all twelve supplied `required_test_files` and
reached its final Jest summary: **12 passed, 12 total; 1450 passed, 1450
total**. The persisted criterion says 16 files, but its authoritative path list
contains 12. The runner then remained alive only because of its reported
asynchronous open handle and was stopped after that complete summary; no second
Jest process was started.

`npm run build-cli` passed. Two fresh public CLI matrices used tiny literal
Blueprints, then generated package, Outcome Library, Stake Engine, and PAR
workbook sources. In each run, seven cells built, `inspect` read back the
artifact, and `--dry-run` completed without creating its requested output:
Blueprint → tsPackage/outcomeLibrary/stakeAdapter; Outcome Library →
outcomeLibrary/stakeAdapter; Stake Engine → stakeAdapter; and PAR workbook →
parWorkbook.

Both remaining advertised cells failed identically: a fresh TS package built by
`pokie build <blueprint> --target tsPackage` cannot be used as the source for
either `--target outcomeLibrary` or `--target stakeAdapter`, because its
`dist/index.js` cannot resolve `pokie`. The suggested normal recovery also
failed in the generated package: `npm install --omit=dev --ignore-scripts`
returned `ETARGET: No matching version found for pokie@^1.3.0`.

Studio was launched exactly twice from this checkout with
`node ./dist/cli/pokie.js --no-open`, each time with a fresh Chromium profile.
Visible Projects controls accepted Location via focus-verified browser input,
then completed Detect → Register for each fresh Blueprint. Open did not render
a Dashboard, success, or product error before the bounded wait expired, so that
UI portion is not a product finding and the remaining Studio/PAR card checks
were not reached.

Unretained raw-run transcript checksums: first CLI/UI run
`f136eb9a5562a26d618fba5158d3184e748369bdf4d9dfe5cd799bbb67d2effa`;
fresh-hash rerun
`617e6f28dd7fe41fba98f1d475d75bdbba8cb692163632c29cea55a45de215a0`.
No generated inputs, outputs, browser profile, automation, raw logs, or
process files are retained.
