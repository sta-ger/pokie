# P6-05 host-verification preflight record — not used for verdict

This directory records an initial verification setup attempt. Its default Node
`v18.19.1` could not build the candidate's Vite 8 client (`build-terminal.log`),
so it did not provide a freshly built candidate and is not the verification
verdict. The valid independent rerun is
`../host-verification-node24-20260816/`, built with Node `v24.18.0`.

The files are retained for auditability because they were generated beneath the
requested evidence location before the runtime mismatch was discovered.
