# Getting started

## Install the candidate

Use Node **20.19+ in the 20 line, or 22.12+**, and npm. Obtain a controller-produced archive or an already built local checkout. No public package release is implied here.

```sh
npm install /absolute/path/to/fromstan-pokie.tgz
# Alternative: npm install /absolute/path/to/built/pokie
./node_modules/.bin/pokie --help
```

The package name is `@fromstan/pokie`, while the installed executable is `pokie`. The examples below assume that executable is on PATH (for example inside an npm script); otherwise use `./node_modules/.bin/pokie`. Once a public release exists, `npm install @fromstan/pokie` is the scoped installation form. The current 1.3.0 field is candidate metadata.

## First journey

Work in a disposable empty directory with the installed executable available. Choose **one** starting path:

```sh
# Editable JSON: creates demo.blueprint.json without a wizard
pokie create demo --blank --out demo.blueprint.json
# Or use the interactive wizard: pokie create demo
# Or a deterministic random model: pokie create demo --random --seed 28

# Preview before creating a new artifact; no write on dry-run
pokie build demo.blueprint.json --target tsPackage --out demo-package --dry-run
pokie build demo.blueprint.json --target tsPackage --out demo-package
pokie validate demo-package
pokie sim demo-package --rounds 100 --workers 1 --seed first-journey --format json --out simulation.json
pokie report simulation.json --format html --out simulation.html
pokie replay demo-package --seed first-journey --round 10 --out replay.json
pokie demo.blueprint.json
```

Observe a new editable Blueprint, a runnable package directory, a structural validation result, and separate simulation/report/replay files. Open `simulation.html` locally; use Studio's Replay tab to inspect supported replay data. A report estimates the sampled population; replay by seed is best effort for arbitrary packages and requires the same dependencies and random initialization. See [audit replay](reproducibility.md#audit-replay) for stronger evidence.

You can replace the create step with the downloaded [real sample Blueprint](../../examples/blueprints/sample-slot.blueprint.json), saved as `demo.blueprint.json`. Its full source is rendered below. It uses finite authored reels and paytable inputs checked by the Blueprint validator.

{{example:examples/blueprints/sample-slot.blueprint.json}}

## Init a code-first package

```sh
pokie init code-game
pokie validate code-game
pokie sim code-game --rounds 100 --workers 1 --seed first-journey --format json --out code-simulation.json
pokie code-game
```

`init` scaffolds TypeScript, installs dependencies against the current local POKIE installation, builds and verifies the package. It prepares a code-first package, whereas `create` produces a Blueprint. Keep authored source under version control. A custom package stays code-first when opened; editing and reel generation use its declared capabilities rather than forcing extraction. [Extraction](extraction.md) is a separate explicit conversion.

## Open Studio

Bare `pokie` opens global **Studio Home**, including from inside a project. `pokie .` or `pokie PROJECT` opens that project. Choose a starter in Home, then **Create game** to save the Blueprint and open its workspace. Overview, Game Model, Build/Export, Simulation, Play and Replay provide distinct results. [Studio guide](studio.md).

## Recover from a failure

Run `pokie COMMAND --help` for required inputs. Correct validation errors before building. Package preparation failures include npm output; check the local installation and Node version. Output directories must be new or empty; file targets must not exist, even as zero-byte files. Choose another destination after a conflict. Saving a design and building an artifact are separate actions; neither silently overwrites an existing artifact.
