# P7-19 clean-room Valera direct-export rerun

Independent host verification of `c7daa219ee47ee0cfb0015ffba1a73eb90e01264` on
2026-08-26 UTC confirmed that the installed public CLI directly
exported the deterministic Valera Blueprint to both an Outcome Library and Stake adapter on
the standard Node heap. Each output was identified by `inspect` and validated successfully.
The transcript also records a P2 discoverability finding: `inspect` recommends the unavailable
public command `pokie outcomesource inspect`.

Only the bounded [transcript](TRANSCRIPT.md) and [checksums](CHECKSUMS.sha256) are retained.
They supersede the prior build-target evidence; generated packages, installed dependencies,
Blueprints, exports, logs, and temporary context were removed.
