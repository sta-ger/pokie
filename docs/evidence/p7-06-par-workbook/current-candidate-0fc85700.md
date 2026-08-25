# P7-06 current-candidate packed CLI rerun

Status: **passed** — independently rerun against candidate
`0fc8570048cc13102a21f8f20eb22b78d229a628`.

## Boundary and setup

`git rev-parse HEAD` returned the candidate SHA before packing.  One `npm pack
--json --pack-destination <temporary>/pack` invocation completed its normal
prepack build, producing `pokie-1.3.0.tgz` with SHA-256
`d42260df109d089bbdfdc16fa272d133b1a2acd85f64c8058098a5c0717875d1`.

The tarball was installed once, with no lifecycle scripts, into a fresh
temporary consumer directory:

```text
npm install --ignore-scripts --no-audit --no-fund --prefix <temporary>/consumer <temporary>/pack/pokie-1.3.0.tgz
POKIE=<temporary>/consumer/node_modules/.bin/pokie
cd <temporary>/work
```

Every product operation below used exactly `$POKIE`; no source-checkout CLI,
private importer/exporter API, Studio, test helper, or copied input was used.
Node was `v24.18.0`, npm `11.16.0`.

## Successful physical workbook readback

```text
$POKIE create seeded-generated --random --seed 7106                         exit=0
$POKIE par export seeded-generated.blueprint.json --out direct.par.xlsx     exit=0
$POKIE par import direct.par.xlsx --out direct-readback.blueprint.json      exit=0
$POKIE export seeded-generated.blueprint.json --to workbook --out generic.par.xlsx  exit=0
$POKIE import generic.par.xlsx --out generic-readback.blueprint.json        exit=0
```

The installed CLI reported both imports as `Seeded Generated`
(`id=seeded-generated`, `v0.1.0`), `3 x 4`, with eight symbols, and reported
matching exported provenance hashes.  Independent JSON inspection of each
readback found `reelStrips=36,36,36` and no `reelStripGeneration`:

```text
direct-readback.blueprint.json:  id=seeded-generated; reels=3; rows=4; symbols=8; reelStrips=36,36,36; reelStripGeneration=false
generic-readback.blueprint.json: id=seeded-generated; reels=3; rows=4; symbols=8; reelStrips=36,36,36; reelStripGeneration=false
```

The direct `.xlsx` was a physical ZIP workbook with `[Content_Types].xml`,
`xl/workbook.xml`, `xl/sharedStrings.xml`, `xl/styles.xml`, and six worksheet
entries.  No generated workbook or Blueprint is retained here; their checksums
are:

```text
seeded-generated.blueprint.json before/after: 697741c016fc874498432e8753ca8cef05f7349e345b094044302f0717deb2db
direct.par.xlsx   10823 bytes  1a4e6ad28c440802e5e6181996c14a9be24c3e51fa5f81c38f2ec6aefa4b2f18
generic.par.xlsx  10823 bytes  a610cabf7818a7570b2bb2c9db05a3b75880705b3270ded00a38e67c7caf298f
```

## Destination-safety matrix

Each occupied destination was first populated with a unique sentinel.  Each
alias destination traversed a directory symlink back to its input.  The command
exit and before/after SHA-256 values are the public workflow result.

| Surface | Command result | Preserved bytes |
| --- | --- | --- |
| direct export, occupied XLSX | `pokie par export … --out direct-export-occupied.xlsx` → exit 1, `already exists` | `dec5716059f8960473e645e800a23e2a498b3e96282151551d5e1fbe5e71315e` → same |
| generic export, occupied XLSX | `pokie export … --to workbook --out generic-export-occupied.xlsx` → exit 1, `already exists` | `d0742be800a6fa43f2ff3c77928b9c1ab3252d50450fd80cc29a2e15018d6108` → same |
| direct export, resolved Blueprint alias | `pokie par export … --out <alias>/seeded-generated.blueprint.json` → exit 1, `destination … is the source itself` | source `697741…deb2db` → same |
| generic export, resolved Blueprint alias | `pokie export … --to workbook --out <alias>/seeded-generated.blueprint.json` → exit 1, `destination … is the source itself` | source `697741…deb2db` → same |
| direct import, occupied JSON | `pokie par import direct.par.xlsx --out direct-import-occupied.blueprint.json` → exit 1, `already exists` | `13745cd7d33c6f53e77c2d76af1fa0a2600047857e49f41ed3f3319fb228e447` → same |
| generic import, occupied JSON | `pokie import generic.par.xlsx --out generic-import-occupied.blueprint.json` → exit 1, `already exists` | `427948dda7b355c4d4d8dc821763a848133fe65bfa6d2ee828f8fbfb046c365d` → same |
| direct import, resolved workbook alias | `pokie par import direct.par.xlsx --out <alias>/direct.par.xlsx` → exit 1, `destination … is the source itself` | direct workbook `1a4e6a…4b2f18` → same |
| generic import, resolved workbook alias | `pokie import generic.par.xlsx --out <alias>/generic.par.xlsx` → exit 1, `destination … is the source itself` | generic workbook `a610ca…af298f` → same |

The temporary pack, consumer installation, symlink, inputs, outputs, and raw
logs were removed after recording this bounded proof.  This file is the only
new retained payload from the rerun.
