# PC-17 targeted verification

- Candidate commit: `897ae5c4ba031aa7b6ae9d474b2b03ba33621448`
- Run date: 2026-09-05 (UTC)
- Command: `npm run test:targeted -- <the 23 required_test_files from the persisted PC-17 verification request>`
- Result: **passed** — 23 test suites, 576 tests, 0 failures; duration 452.98 s.

The command was run once, sequentially (`--runInBand`), against the candidate
checkout. It included `tests/scripts/check-cli-inventory.test.mjs` and every
other required test file. Jest printed only non-failing React `act(...)`
warnings alongside the successful result.
