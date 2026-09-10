# Freeze receipt and protocol check

Verifier-controlled receipt:
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/PC-20-42fe809212234b68/pc-19-03dd9b9b-freeze-receipt.json`

Receipt SHA-256:
`ce24725e1def6bdf673b0c6dca7ddb88255fb5f037260477d87c60688872a92d`.

The receipt's candidate ID, archive digest, frozen timestamp, and frozen
findings SHA-256 (`d81c2e8c6083bed7617577652b985db7ea750bb9974e280d247cddf021e67050`)
match this record. The PC-19 protocol validator was invoked with that exact
receipt path and digest. It returned `missing required record PROVENANCE.json`,
as expected for this intentionally incomplete record; no post-freeze comparison
or complete-release validation is claimed.
