# P7-06 independent packed-CLI rerun — b183f162

Status: **passed**.  This is a new independent run; the prior finding in
[`README.md`](README.md) is retained as historical evidence.

## Method and provenance

- Candidate: `b183f162c856e2e817eec8d730255ecdfe5d3546` (checked with
  `git rev-parse HEAD` before packing).
- Public documentation consulted: `docs/cli.md`, **“pokie par import /
  pokie par export”** (lines 774–916), which documents both verbs and their
  no-overwrite/seed preflight contract.
- Pack: `npm pack --json --pack-destination /tmp/p7-06-packed-cli-L9JYPo/pack`.
  Tarball: `pokie-1.3.0.tgz`, SHA-256
  `5acd6c8da0e80a84ca685172acef7a98cb0ecfc10fed964fb5cab8cf14e3b23a`.
- Fresh consumer: `npm install --ignore-scripts --no-audit --no-fund --prefix
  /tmp/p7-06-packed-cli-L9JYPo/consumer <tarball>`; all product operations
  below used only
  `/tmp/p7-06-packed-cli-L9JYPo/consumer/node_modules/.bin/pokie` in a fresh
  `/tmp/p7-06-packed-cli-L9JYPo/work` directory.  No source CLI, private
  importer/exporter API, Studio, or test helper was used.
- Runtime: Node `v24.18.0`, npm `11.16.0`.

## Installed executable reachability

| Command | Exit | Concrete installed-CLI result |
| --- | ---: | --- |
| `pokie --help` | 0 | Lists `par` and describes it as Blueprint ↔ PAR XLSX import/export. |
| `pokie par --help` | 0 | Lists `import` and `export` child commands. |
| `pokie par export --help` | 0 | Accepts `<config.json>` and `--out <output.xlsx>`. |
| `pokie par import --help` | 0 | Accepts `<input.xlsx>`, `--out <blueprint.json>`, and `--format json`. |

## Fresh canonical input and immutable source

```text
$ pokie create seeded-generated --random --seed 7106
exit=0
Generated random game "Seeded Generated" (id: "seeded-generated") from seed 7106.
Provenance: generator 1.1.0, strategy "default-line-pay".
created ./seeded-generated.blueprint.json

seeded-generated.blueprint.json SHA-256, before and after every workflow operation:
697741c016fc874498432e8753ca8cef05f7349e345b094044302f0717deb2db
```

The installed CLI created the input.  Its authored shape was `reels=3`,
`rows=4`, `symbols=8`, with three generated reels and integer seeds
`[656797081, 51952579, 621862318]`.

## Success path: default, explicit, direct export, and physical readback

```text
$ pokie build seeded-generated.blueprint.json --target parWorkbook --dry-run
exit=0; reports .../parWorkbook.xlsx; "No files written."; destination absent

$ pokie build seeded-generated.blueprint.json --target parWorkbook
exit=0; wrote parWorkbook.xlsx (10,849 bytes)

$ pokie build seeded-generated.blueprint.json --target parWorkbook --out explicit.par.xlsx
exit=0; wrote explicit.par.xlsx (10,850 bytes)

$ pokie par export seeded-generated.blueprint.json --out direct.par.xlsx
exit=0; Exported "seeded-generated.blueprint.json" to "direct.par.xlsx". (10,821 bytes)

$ pokie par import parWorkbook.xlsx --out imported-default.blueprint.json
exit=0; imported Seeded Generated (id seeded-generated, v0.1.0), 3 x 4, 8 symbols;
provenance hash matches imported data

$ pokie par import explicit.par.xlsx --out imported-explicit.blueprint.json
exit=0; same successful mapped readback and matching provenance hash

$ pokie par import direct.par.xlsx --out imported-direct.blueprint.json
exit=0; same successful mapped readback and matching provenance hash
```

Readback of each imported Blueprint contains `manifest.id=seeded-generated`,
`reels=3`, `rows=4`, symbols `["7", "Q", "J", "8", "9", "A", "10", "K"]`,
eight three-of-a-kind paytable entries, `availableBets=[1,2,5,10]`, literal
reel-strip lengths `[36,36,36]`, and no `reelStripGeneration`.  This is the
expected physical snapshot while the source above remains byte-identical.

| Artifact | SHA-256 |
| --- | --- |
| `parWorkbook.xlsx` | `2da8e49290d3498ecc253eb23e805928ae09cc80da0258364b06098f61590125` |
| `explicit.par.xlsx` | `e9410541a7430e6d78ecd3ea81c2638d2b7ae73e5978c9669b7c9696ee9ba0ce` |
| `direct.par.xlsx` | `04eca7fd1371285d691fcd3a004b992cd4f8921d6fa2dad02a108cd4626be68c` |

`unzip -l` on both build workbooks found normal XLSX structure:
`[Content_Types].xml`, `_rels/.rels`, `xl/workbook.xml`,
`xl/_rels/workbook.xml.rels`, `xl/sharedStrings.xml`, `xl/styles.xml`, and six
worksheet XML entries (`xl/worksheets/sheet1.xml` through `sheet6.xml`).

## No-write and actionable-diagnostic checks

```text
# conflict.xlsx initially contains exactly "PAR destination sentinel\\n"
$ pokie build seeded-generated.blueprint.json --target parWorkbook --out conflict.xlsx
exit=1; "already exists" and "never overwrites an existing file"
SHA-256 before = 65fe5bc23a2ffd106158be1c45172f624f23421995ea7b53099c7e13133cbe04
SHA-256 after  = 65fe5bc23a2ffd106158be1c45172f624f23421995ea7b53099c7e13133cbe04

# Derived only by deleting reelStripGeneration[0].seed from the installed-CLI-created input.
$ pokie build unseeded-generated.blueprint.json --target parWorkbook --out unseeded-build.par.xlsx
exit=1; `blueprint-reelstripgeneration-invalid-seed` and
`parsheet-reel-generation-seed-required` name `reelStripGeneration[0].seed` and
say it requires an authored integer seed; output absent

$ pokie par export unseeded-generated.blueprint.json --out unseeded-direct.par.xlsx
exit=1; the same two diagnostics, including “Add an integer \"seed\" to
\"reelStripGeneration[0]\" and export again.”; output absent
```

The temporary pack, consumer installation, inputs, workbooks, imports, and
diagnostic copies were not retained.  This bounded transcript is the complete
new evidence payload.
