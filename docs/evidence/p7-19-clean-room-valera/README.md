# P7-19 clean-room Valera CLI journey

Independent host verification of candidate `03e0474c558bd55bcd3946292473cf07ecd80c0a`
on 2026-08-26 (UTC): **passed**.

From a newly-created temporary directory, the candidate was packed and installed as
`pokie@1.3.0` (tarball SHA-256 `cec6e58c942c983a1ca50bb55e1ef17cf5e4dd88abcdf6a2920850d0205c4757`).
After installation every POKIE command used only `./node_modules/.bin/pokie`; documentation
was read only from `node_modules/pokie/README.md` and `node_modules/pokie/docs/`.
No checkout fixture, source module, prior audit, hidden state, or edited generated artifact
was used as an input.

The package supplied all ten Markdown targets linked by its README and the certification
document named by CLI help. A deterministic, large public Blueprint (`85,766,121` raw
reel-stop combinations) completed Blueprint-to-Outcome and Blueprint-to-Stake exports on
the standard Node heap. Both outputs were read back and validated; the Stake import/re-export
also reproduced its `index.json`, CSV, and compressed books byte-for-byte. The documented
package lifecycle (build, validate, simulation, report, diff, replay, outcome generation,
PAR import/export, certification, serve, and dev) completed in the fresh context.

Only the bounded transcript and checksums are retained. Superseded evidence for older
candidates was removed from this evidence root; generated packages, outcome libraries,
Stake directories, workbooks, dependencies, logs, and temporary automation were not committed.

See [TRANSCRIPT.md](TRANSCRIPT.md) and [CHECKSUMS.sha256](CHECKSUMS.sha256).
