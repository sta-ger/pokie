# PC-20 current-candidate exact-generation rerun

Candidate `63e57457ef5c9da5595479197c76e7669c6192ef` was built from this checkout.
The retained candidate archive is `artifacts/pokie-1.3.0.tgz`, SHA-256
`d497c44fc25174aafeba8d5c3d44b879c22a7518c21209be9218a7b79ca3daf1`
(3,211,635 bytes).  Its verifier-owned freeze receipt is outside this review
directory at `/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/PC-20-e3fea3bb3f7e68c2/pc-20-freeze-receipt.json`.

The candidate-built public CLI completed the required exact cancellation and
recovery path on a 1,000,000-combination package: one SIGINT after its own
rendered `progress 5000 / 1000000` message exited 130, left no destination or
staging file, and wrote its checkpoint.  One `generate --resume` activation
then exited 0, produced the library, deleted that checkpoint, and left no
staging file.

Studio was launched twice with exactly `node ./dist/cli/pokie.js --no-open` in
fresh profiles.  Both rendered the home and advanced Load controls, but the
visible Load action retained the rendered Starter Slot value instead of the
typed external blueprint path.  No Studio exact-generation action was thereby
accepted, so the Studio cancellation/recovery contract is driver-inconclusive,
not a product finding.  No rendered product error or P0/P1/material-P2 defect
was observed in the reachable workflow; the required complete Studio verdict
is deliberately not claimed.

The unretained harness transcript has SHA-256
`463d81eb02694c3569de4373a3636222156448ab3a0f89503da4cf2f23451f62` and
contains the bounded command/output excerpts and rendered-control trace.
