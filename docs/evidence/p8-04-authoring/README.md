# P8-04 independent fresh-profile authoring rerun

Candidate: `cce79716790ae3cfc8d6f5c095fbc08426386e56`  
Date: 2026-08-27  
Launch: `node ./dist/cli/pokie.js --no-open` after a clean candidate build.

Two permitted isolated public-UI launches reached **Design Your Game**, showed
the required/optional metadata guidance, opened **Choose a different start**,
and selected **Use the starter game**.  Studio was ready in 1378 ms in both
runs; fresh Chromium was ready in 494 ms and 474 ms; the guided screen rendered
in 297 ms and 314 ms.

The first rendered keyboard attempt did not leave `Game id` empty.  The harness
was repaired in place to verify focus and send a full Ctrl+A sequence.  In the
second fresh launch, its click still did not produce rendered focus for that
visible input within the 120 s bounded wait.  No rendered product error, console
error/warning, or material network failure was observed; each run only recorded
two `GET /favicon.ico` 404 responses.  This is driver inconclusive, not a product
finding.  The launch budget was then exhausted, so reel reduction, validation,
save/reopen, and workspace continuation were not reached.

No screenshots or generated logs are retained: neither run reached an outcome
that would be representative proof.  The discarded bounded diagnostic JSON had
these SHA-256 values:

- first interaction run: `814d059ef32998b5329e0f79bab00a181ac429e29056062fc10f8b3b86959749`
- repaired-focus retry: `5e7a0274f3d5a4c7828e58376a7f8b1db1b737baf5a8b9cdc3376c579f910ac5`
