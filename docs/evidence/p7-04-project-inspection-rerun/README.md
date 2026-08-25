# P7-04 independent public `inspect` rerun

Candidate: `c9320f028b78b7dc4344c35c5e28a3a3ad97ef7c`.

I ran `npm pack --pack-destination <fresh-pack-dir>` at that checkout, then made two separate fresh temporary consumer directories.  Each used `npm install --ignore-scripts --no-audit --no-fund <fresh-pack-dir>/pokie-1.3.0.tgz`; every inspection was invoked through that installed package's public CLI:

```text
node <fresh-consumer>/node_modules/pokie/dist/cli/pokie.js inspect <fresh-input>
```

The transcript records six synthetic, minimal public-format inputs (Blueprint, game package, Outcome Library, Stake Engine export, PAR workbook, and compatible WASM component), plus malformed package metadata and an unsupported text file.  Each input tree was SHA-256 checked immediately before and after its `inspect` invocation; all sixteen checks (the original run and the clean independent rerun) were unchanged.  The package tarball SHA-256 was `64726b3cdefaa78ec919aae26f1e1b9994485a39535e56add4bf5275df093510`.

Results: the twelve supported-input invocations exited 0 and displayed the expected public kind, runnable next actions, and prerequisites.  The four malformed/unsupported invocations exited 1 with actionable recovery guidance.  A scan of the rendered transcript found no implementation-facing diagnostic vocabulary.

Only this concise record and its checksum are retained; the tarball, consumers, generated fixtures, and installation trees remain outside the repository.
