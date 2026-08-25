# Transcript

All paths below marked `<cli>` refer to the fresh tarball installation's
`node_modules/.bin/pokie` executable. Every command shown was run against
candidate `dbabb512c8cb3c75f031cae94d763a6893115ca1`.

```text
npm pack --pack-destination <fresh-temp>                         exit 0
npm install --prefix <fresh-temp>/install --ignore-scripts --no-package-lock <tarball>
                                                               exit 0
<cli> --version                                                  exit 0  (1.3.0)

<cli> build <small-blueprint> --target outcomeLibrary --exact --out <exact-library>
                                                               exit 0
<cli> build <large-blueprint-a> --target outcomeLibrary --sample 12 --seed p7-07-seed-alpha --out <library-a>
                                                               exit 0
<cli> build <large-blueprint-b> --target outcomeLibrary --sample 12 --seed p7-07-seed-alpha --out <library-b>
                                                               exit 0
<cli> build <large-blueprint-c> --target outcomeLibrary --sample 12 --seed p7-07-seed-beta --out <library-c>
                                                               exit 0
<cli> build <large-blueprint> --target outcomeLibrary --sample 0 --seed p7-07-seed-alpha --out <out>
                                                               exit 1
  --sample must be a positive integer. Usage: pokie build ...
<cli> build <large-blueprint> --target outcomeLibrary --sample 12 --out <out>
                                                               exit 1
  --sample requires --seed. Usage: pokie build ...

<cli> validate <library-a> --deep                               exit 0
  "<library-a>" is valid (deep check).
<cli> sample <library-a> --mode base --seed downstream-alpha    exit 0
  drew outcome outcome-9d3b064c040e34c5, weight 2 / 12, total win 5
<cli> sim <library-a> --mode base --rounds 12 --seed lifecycle-alpha --out <sim.json>
                                                               exit 0
  rounds 12; total bet 12.00; total win 6.00; RTP 50.00%; max win 5.00
<cli> report <library-a> --format json --out <report.json>      exit 0
  readback: mode base, totalWeight 12, RTP 1.0, maxWin 5
<cli> replay <library-a> --mode base --seed lifecycle-alpha --round 2 --out <replay.json>
                                                               exit 0
  readback: game p7-07-large-sampled-slot; round 2; totalBet 1; totalWin 0
<cli> serve <library-a> --mode base --port 0
  POKIE outcome-source dev server listening on http://127.0.0.1:41279
  GET /game                                                       HTTP 200
  (server then intentionally terminated after the successful endpoint check)
```

Structural readback from `<library-a>/manifest.json`:

```json
{"strategy":"bounded-coverage","totalOutcomeSpaceSize":27000000,"sampledRawCount":12,"seed":"p7-07-seed-alpha","game":{"id":"p7-07-large-sampled-slot"}}
```

`index_base.json` readback: `outcomeCount=7`, `totalWeight=12`, and library
hash `sha256:c7e0e162c7ea1b221c3bf6edd60703f848b77f5671cd742a6fc47c73ef918c4f`.
The same-seed `outcomes_base.jsonl` byte streams had identical SHA-256 values;
the different seed's byte stream had the distinct checksum recorded in the
README.

One complete required targeted command was run (no concurrent Jest process):

```text
npm run test:targeted -- tests/cli/commands/GenerateCommand.test.ts tests/cli/publicCommandTree.test.ts tests/cli/commands/OutcomeSourceCommand.test.ts tests/cli/commands/ReportCommand.test.ts tests/cli/commands/ReplayCommand.test.ts tests/cli/commands/ServeCommand.test.ts tests/cli/commands/ValidateCommand.test.ts
exit 0: 7 suites passed; 105 tests passed; 0 snapshots.
```
