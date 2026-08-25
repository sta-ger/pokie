# P7-06 independent public CLI rerun

Status: **finding** — the public `pokie par export` command is not registered in
the packed/installed candidate (see the direct-export check below).  All reachable
`build --target parWorkbook` and generic `import` checks passed.

## Candidate and method

- Candidate commit: `21233c1fa595f2b8b5a9dd966b127302db4ded2c`
- Pack command: `npm pack --json`; tarball SHA-256:
  `3af703fbdcf17c19f91c8a68cbccae5a76f6d60e077829cd861963f0510bcdcc`
- Fresh consumer: `npm install --ignore-scripts --no-audit --no-fund --prefix
  /tmp/p7-06-public-cli-775PYF/consumer <tarball>`; all workflow commands used
  only `/tmp/p7-06-public-cli-775PYF/consumer/node_modules/.bin/pokie`.
- Node `v24.18.0`, npm `11.16.0`.  No source CLI, private importer/exporter API,
  Studio, or test helper was used.

The input was created by the installed public CLI, not copied from the source:

```text
pokie create seeded-generated --random --seed 7106
exit=0; generated seeded-generated.blueprint.json
source SHA-256 before/after workflow:
697741c016fc874498432e8753ca8cef05f7349e345b094044302f0717deb2db
```

Its public `create --help` says `--random` writes an always-valid generated
Blueprint and accepts `--seed` for reproduction; the resulting input contained
three seeded `reelStripGeneration` entries.

## Public help evidence

Installed `pokie --help` advertises `build` with `parWorkbook` and says
`--dry-run` writes nothing.  Installed `pokie reel` help says `--materialize`
persists a collapsed literal Blueprint **optionally**, while “PAR workbook export
snapshots supported generated, weighted, default, and literal reel sources without
materializing the authored Blueprint.”  Thus public help confirms that
`--materialize` is not a PAR-export prerequisite.

## Reachable workbook workflow

```text
pokie build seeded-generated.blueprint.json --target parWorkbook --dry-run
exit=0; reports destination .../parWorkbook.xlsx; no file written

pokie build seeded-generated.blueprint.json --target parWorkbook
exit=0; wrote parWorkbook.xlsx (10,844 bytes)

pokie build seeded-generated.blueprint.json --target parWorkbook --out explicit.par.xlsx
exit=0; wrote explicit.par.xlsx (10,844 bytes)

pokie import parWorkbook.xlsx --out imported-default.blueprint.json
exit=0; imported Seeded Generated, id seeded-generated, v0.1.0; 3 x 4; 8 symbols;
provenance hash matches imported data

pokie import explicit.par.xlsx --out imported-explicit.blueprint.json
exit=0; same successful readback and matching provenance hash
```

Both imported JSON files have `reels=3`, `rows=4`, the eight authored symbols and
paytable entries, literal reel-strip lengths `[36,36,36]`, and no
`reelStripGeneration`; this is the expected physical literal snapshot.  Both XLSX
files have the normal XLSX structural entries (`[Content_Types].xml`, workbook,
styles, shared strings, and six worksheet XML files).  Workbook SHA-256 values:

```text
parWorkbook.xlsx  0f23e8974677a3bc7821de285765e536bcd436b20074b1dece166ff312ff4bbd
explicit.par.xlsx ac3d04bb0b387f824517de510f7ee87878fef06c900fbf7e622b11b652e197fe
```

## No-write checks

```text
# conflict.xlsx initially contains "PAR destination sentinel\n"
pokie build seeded-generated.blueprint.json --target parWorkbook --out conflict.xlsx
exit=1; reports existing file will not be overwritten
conflict SHA-256 before/after:
65fe5bc23a2ffd106158be1c45172f624f23421995ea7b53099c7e13133cbe04

# First generated reel's seed removed from a copy of the installed-CLI output.
pokie build unseeded-generated.blueprint.json --target parWorkbook --out unseeded-build.par.xlsx
exit=1; reports blueprint-reelstripgeneration-invalid-seed and
parsheet-reel-generation-seed-required, explicitly naming reelStripGeneration[0].seed
unseeded-build.par.xlsx absent
```

## Finding: unavailable direct public export

```text
pokie par export unseeded-generated.blueprint.json --out unseeded-direct.par.xlsx
exit=1
Unknown command "par". Run `pokie --help` to list commands.
unseeded-direct.par.xlsx absent
```

This prevents the required direct `pokie par export` workflow and its required
unseeded seed-guidance check from being exercised through the public CLI, despite
the source documentation describing that command.
