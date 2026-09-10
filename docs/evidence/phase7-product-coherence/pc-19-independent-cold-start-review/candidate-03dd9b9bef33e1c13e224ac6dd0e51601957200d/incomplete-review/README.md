# Incomplete independent PC-19 review — exact candidate

Candidate: `03dd9b9bef33e1c13e224ac6dd0e51601957200d`.

The exact archive created from this checkout before either Studio launch is
`artifacts/pokie-1.3.0.tgz` (3,220,705 bytes, SHA-256
`3ba7cde00e67d1205def985ef20958198ec2aca16ee6207e89ee632a57662622`).

Two fresh-profile Studio launches used exactly
`node ./dist/cli/pokie.js --no-open`, never the installed self-dependency.
Their concise rendered result is in [workflow.md](workflow.md). No action-local
product failure was observed. This is deliberately not a complete PC-19
acceptance: remaining required replay, Outcome Library, Stake, PAR, archive-CLI,
lifecycle, parity, and role coverage lacks an action-local terminal correlation.

The empty blind finding set was frozen before any comparison. The verifier-owned
receipt is retained outside this mutable review directory at
`/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/PC-20-42fe809212234b68/pc-19-03dd9b9b-freeze-receipt.json`; its digest and binding are recorded
in [receipt-check.md](receipt-check.md). No post-freeze comparison was opened,
and the repository PC-19 validator correctly cannot accept an incomplete review.
