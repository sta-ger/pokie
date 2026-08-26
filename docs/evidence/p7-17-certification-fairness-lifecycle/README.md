# P7-17 independent public lifecycle verification

Candidate: `c02a7aa636bbae6b9e89f7d8883391bfa83aa061`
Status: **passed**

From one fresh temporary directory, the verifier packed this checkout, installed
that tarball with scripts disabled, and used only its installed entrypoint:
`node <fresh>/install/node_modules/pokie/dist/cli/pokie.js`. It did not use
this checkout's `node_modules/.bin/pokie`, private APIs, or edit generated
lifecycle artifacts.

The packed CLI reported version `1.3.0` and its public help listed both
`outcomelibrary` and `outcomesource`. A public `create --random` produced the
starting Blueprint; all subsequent package, library, bundle, certification,
commitment, and proof inputs were outputs of the preceding public commands
(apart from the two documented authored configuration files and server-seed
text input).

The complete public chain passed:

`Blueprint -> tsPackage -> outcomelibrary generate/build/validate -> outcomesource inspect/sample -> certification build/verify -> fairness seed-commit/commit/reveal/verify`.

Repeat generation produced identical library bytes; repeat seeded sampling had
the same outcome and artifact; repeat certification had the same evidence
content hash and identical samples bytes. Copied tampered evidence, a copied
stale source bundle, and a copied tampered fairness proof each failed their
respective public verifier with exit 1 and actionable, typed diagnostics.

See [TRANSCRIPT.md](TRANSCRIPT.md) for the bounded command, readback, checksum,
and negative-case record. No tarball, install tree, generated artifact,
automation source, or full raw log is retained.
