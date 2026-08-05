// A machine-readable inventory of every public v1.3 `pokie` CLI command (see cli/pokie.ts's own
// `commands` array, which this list's order and names mirror exactly), plus a frozen, EXECUTABLE
// contract for each one: CLI_CONTRACT_CASES below pairs every "invalid" argv (a missing
// positional/subcommand, or a bad flag value — caught before any I/O) with the exact error message
// it throws today, and every "valid" argv (a default or documented option value actually accepted)
// with the exit code and stdout shape it actually produces. CLI_TOP_LEVEL_DISPATCH_CASES does the
// same for the dispatcher itself, not any one command: --help/-h, an unrecognized command, and
// --version (which has no dedicated top-level handling today — see that case's own comment).
//
// This exists so a future rewrite of argument parsing (e.g. unifying the 19 hand-rolled
// parseArgs()/switch-based parsers in cli/commands/*.ts behind one shared parser) has something
// concrete to diff against: cliCommandInventory.contract.test.ts replays every case below through
// the real dispatch() function and the real command classes (never a second, hand-rolled parser)
// and asserts nothing changed. A deliberate wording/behavior change updates this file in the same
// commit; an accidental one fails the test.
//
// "invalid" cases are side-effect-free by construction — every command's own parseArgs() validates
// positionals/options before any I/O, so a missing-positional or bad-flag-value case is always
// reachable without touching the filesystem, binding a port, or spawning a subprocess (see this
// repo's "never spawn a CLI command as a subprocess in tests" convention — tests/packaging/
// npmPackSmoke.test.ts is the one sanctioned exception, for packaging itself, not per-command
// behavior). "valid" cases replay a real accepted argv, but only ever against a command instance
// built with every I/O-touching dependency (filesystem, server, worker) swapped for a fast,
// deterministic fake via that class's own constructor injection points (see
// registerCommandsForValidCases() in cliCommandInventory.contract.test.ts) — never a real file, a
// real bound port, or a real subprocess either.

import {ALL_SLOT_GAME_NAME_THEMES, MAX_SIMULATION_WORKERS, SimulationConfig} from "pokie";

export type CliVerbDescriptor = {
    // The subcommand literal (e.g. "import", "seed-commit"); undefined for a command with no
    // subcommands, or for the bare "unknown subcommand" dispatch case of one that does.
    verb: string | undefined;
    usage: string;
    positionals: string[];
    options: CliOptionDescriptor[];
};

// A single declared option's own machine-readable validation contract, independent of its
// human-readable `usage` spelling (which stays on CliVerbDescriptor.usage, unchanged) — this is
// what cliCommandInventory.contract.test.ts's own "CLI option contract coverage" describe block
// walks to derive, per option, exactly which CLI_CONTRACT_CASES entries are required to exist:
//   - "boolean": a no-value flag (its mere presence is the whole contract, e.g. --dry-run,
//     --overwrite, --json, --deep, --no-open). Never "required". Requires only an "accepted"
//     case (present) and a "default" case (some other case in the same verb group that omits it).
//   - "unvalidated": takes a value; parseArgs never rejects any particular value for this option,
//     only requires it be present at all when the flag itself is given. Requires "accepted", plus
//     either "default" (optional) or "required-missing" evidence (required) — see `required`.
//   - "validated": takes a value; parseArgs validates its shape/range and rejects a bad one with a
//     dedicated, flag-naming error message. Requires "accepted" and "rejected-value" evidence (an
//     invalid case whose args include this flag and whose error message names it), in addition to
//     whatever `required`/optional evidence a plain "unvalidated" option would need.
//   - "grouped": one of sim's --min-rounds/--rtp-tolerance/--check-interval/--stable-checks —
//     each does validate its own value, but their *required* semantics are cross-field (all-or-
//     nothing as a group, already frozen by CLI_CONTRACT_CASES' own dedicated group-level invalid
//     cases), not independently meaningful per flag the way e.g. --preset's is. Declared as its own
//     kind rather than "validated" so the coverage check doesn't also demand a lone per-flag
//     rejected-value case that would misrepresent this as independent, single-flag validation.
export type CliOptionKind = "boolean" | "unvalidated" | "validated" | "grouped";

export type CliOptionDescriptor = {
    // Canonical flag token exactly as it appears in argv, e.g. "--out", "--dry-run".
    flag: string;
    required: boolean;
    kind: CliOptionKind;
    // The exact value observed at this option's own command-observable seam -- an injected
    // dependency argument this option's value is threaded through unmodified, or a deterministic
    // stdout shape it controls -- when the flag is OMITTED. Every value is compared as a string (see
    // observe() in cliCommandInventory.contract.test.ts), so an option whose parsed value stays
    // `undefined` when omitted (no in-command default substituted before reaching the seam) records
    // the literal string "undefined" here, same as `String(undefined)` would. Omitted (no property at
    // all) only for a required option, which has no default to observe, and for "boolean" options,
    // whose default is always the literal "false" (see acceptedValue below) written out explicitly
    // rather than left implicit, per this field's own purpose.
    defaultValue?: string;
    // The exact value observed at that same seam when the flag is given its one documented, accepted
    // value in CLI_CONTRACT_CASES -- always the literal "true" for a "boolean" option (the flag's own
    // presence, since a boolean carries no separate value token in argv).
    acceptedValue: string;
};

export type CliCommandDescriptor = {
    name: string;
    description: string;
    verbs: CliVerbDescriptor[];
};

// Order matches cli/pokie.ts's `commands` array exactly.
export const CLI_COMMAND_DESCRIPTORS: CliCommandDescriptor[] = [
    {
        name: "build",
        description:
            "Generate a POKIE game package from a GameBlueprint JSON config (reels, symbols, paylines, paytable), " +
            'or write an editable starter blueprint via --init-blueprint <file> (for a ready-to-run package ' +
            'instead, see "pokie init"). "random"/--random generates a first-class random game instead ' +
            "(--seed to reproduce it, --preset default|variant to pick the generation strategy). --dry-run " +
            "validates and previews without writing anything.",
        verbs: [
            {
                verb: undefined,
                usage: "Usage: pokie build <config.json> [--target <dir>] [--dry-run]",
                positionals: ["config.json"],
                options: [
                    {flag: "--target", required: false, kind: "unvalidated", defaultValue: "undefined", acceptedValue: "customOutDir"},
                    {flag: "--dry-run", required: false, kind: "boolean", defaultValue: "false", acceptedValue: "true"},
                ],
            },
            {
                verb: "--init-blueprint",
                usage: "Usage: pokie build --init-blueprint <file>",
                positionals: ["file"],
                options: [],
            },
            {
                verb: "random",
                usage: "Usage: pokie build random [--seed <integer>] [--target <dir>] [--dry-run] [--preset default|variant]",
                positionals: [],
                options: [
                    {flag: "--seed", required: false, kind: "validated", defaultValue: "undefined", acceptedValue: "4242"},
                    {flag: "--target", required: false, kind: "unvalidated", defaultValue: "undefined", acceptedValue: "random-accepted-out-dir"},
                    {flag: "--dry-run", required: false, kind: "boolean", defaultValue: "false", acceptedValue: "true"},
                    {flag: "--preset", required: false, kind: "validated", defaultValue: "default", acceptedValue: "variant"},
                ],
            },
        ],
    },
    {
        name: "certification",
        description:
            "Build a canonical POKIE certification/evidence bundle on top of an outcome-library bundle, or verify one " +
            '("pokie certification build <bundleDir> <config.json>" / "pokie certification verify <certDir>").',
        verbs: [
            {
                verb: "build",
                usage: "Usage: pokie certification build <bundleDir> <config.json> [--out <dir>]",
                positionals: ["bundleDir", "config.json"],
                // defaultValue "certification": the command computes path.join(path.dirname(configPath),
                // "certification") itself when --out is omitted; with configPath "config.json" that resolves to
                // "certification" (see CertificationCommand.parseBuildArgs), observed at builder.buildFromBundle's
                // own outDir argument.
                options: [{flag: "--out", required: false, kind: "unvalidated", defaultValue: "certification", acceptedValue: "customCertOut"}],
            },
            {
                verb: "verify",
                usage: "Usage: pokie certification verify <certDir> --source <bundleDir>",
                positionals: ["certDir"],
                options: [{flag: "--source", required: true, kind: "unvalidated", acceptedValue: "bundleDir"}],
            },
        ],
    },
    {
        name: "client",
        description: 'Experimental: serve the universal browser preview UI for a running "pokie serve" API.',
        verbs: [
            {
                verb: undefined,
                usage:
                    "Usage: pokie client <packageRoot> [--port <number>] [--host <string>] [--api-host <string>] [--api-port <number>]",
                positionals: ["packageRoot"],
                options: [
                    {flag: "--port", required: false, kind: "validated", defaultValue: "undefined", acceptedValue: "4444"},
                    {flag: "--host", required: false, kind: "unvalidated", defaultValue: "undefined", acceptedValue: "0.0.0.0"},
                    // defaultValue "127.0.0.1"/"3000": the command resolves apiHost/apiPort with `?? DEFAULT_API_HOST`
                    // / `?? DEFAULT_API_PORT` before building options.apiAddress, so those concrete defaults (not
                    // `undefined`) are what reach the createServer seam when the flag is omitted.
                    {flag: "--api-host", required: false, kind: "unvalidated", defaultValue: "127.0.0.1", acceptedValue: "10.0.0.1"},
                    {flag: "--api-port", required: false, kind: "validated", defaultValue: "3000", acceptedValue: "3001"},
                ],
            },
        ],
    },
    {
        name: "create",
        description:
            "Design an editable Blueprint Project -- a hand-editable GameBlueprint JSON file (reels, symbols, " +
            "paytable, reel weighting) -- through an interactive wizard when run in a terminal with no --blank/" +
            '--random ("pokie create <name>" pre-fills the name), or write one straight from the filled-in ' +
            "starter template non-interactively via --blank for a bare-minimum one, or --random for an " +
            "always-valid randomly generated one, with its reel weighting already expressed as valid per-reel " +
            "generation (--seed to reproduce it, --preset default|variant to pick the generation strategy). For " +
            'a prepared, immediately valid package instead, use "pokie init".',
        // Three independent verbs, same "sentinel flag rather than a positional" shape "build" already
        // uses for "--init-blueprint"/"random" (see deriveVerbForCase's own doc comment): the bare/named
        // path (no --blank/--random) always runs the interactive wizard (fully dependency-injectable, so
        // still exercisable without a real terminal or touching this repo's own working directory -- see
        // "init"'s own descriptor comment for the same pattern); "--blank" and "--random" are its two
        // explicit non-interactive shortcuts, neither of which ever prompts.
        verbs: [
            {
                verb: undefined,
                usage: "Usage: pokie create [name] [--out <file>]",
                positionals: ["name (optional)"],
                // defaultValue/acceptedValue: both observed at the injected writeFile's own filePath
                // argument, once a stubbed wizard/prompt run the interactive path to completion --
                // "./wiz-slot.blueprint.json" is CreateCommand's own defaultBlueprintPath() for that
                // stub's manifest id, reached via the destination question's own defaultPathFor(id).
                options: [{flag: "--out", required: false, kind: "unvalidated", defaultValue: "./wiz-slot.blueprint.json", acceptedValue: "custom-blueprint-out.json"}],
            },
            {
                verb: "--blank",
                usage: "Usage: pokie create [name] --blank [--out <file>]",
                positionals: ["name (optional)"],
                // defaultValue "./blank-slot.blueprint.json": CreateCommand's own defaultBlueprintPath(),
                // derived from the blank template's own manifest id -- observed at the injected writeFile's
                // own filePath argument. Never prompts -- no wizard/prompt stubbing needed for this verb.
                options: [{flag: "--out", required: false, kind: "unvalidated", defaultValue: "./blank-slot.blueprint.json", acceptedValue: "custom-blank-out.json"}],
            },
            {
                verb: "--random",
                usage: "Usage: pokie create [name] --random [--seed <integer>] [--preset default|variant] [--out <file>]",
                positionals: ["name (optional)"],
                options: [
                    {flag: "--seed", required: false, kind: "validated", defaultValue: "undefined", acceptedValue: "1"},
                    {flag: "--preset", required: false, kind: "validated", defaultValue: "default", acceptedValue: "variant"},
                    // defaultValue "./prime-crown-olympus.blueprint.json": RandomGameBlueprintGenerator's own
                    // real, deterministic output for seed 1 (the "--random --seed <integer>" valid case's own
                    // fixed seed) names the manifest id CreateCommand's defaultBlueprintPath() derives this from.
                    {
                        flag: "--out",
                        required: false,
                        kind: "unvalidated",
                        defaultValue: "./prime-crown-olympus.blueprint.json",
                        acceptedValue: "custom-random-out.blueprint.json",
                    },
                ],
            },
        ],
    },
    {
        name: "dev",
        description: 'Experimental: run "pokie serve" and "pokie client" together, opening a browser preview.',
        verbs: [
            {
                verb: undefined,
                usage:
                    "Usage: pokie dev <packageRoot> [--port <number>] [--host <string>] " +
                    "[--client-port <number>] [--client-host <string>] [--no-open]",
                positionals: ["packageRoot"],
                options: [
                    {flag: "--port", required: false, kind: "validated", defaultValue: "undefined", acceptedValue: "5001"},
                    {flag: "--host", required: false, kind: "unvalidated", defaultValue: "undefined", acceptedValue: "0.0.0.0"},
                    {flag: "--client-port", required: false, kind: "validated", defaultValue: "undefined", acceptedValue: "5101"},
                    {flag: "--client-host", required: false, kind: "unvalidated", defaultValue: "undefined", acceptedValue: "0.0.0.0"},
                    {flag: "--no-open", required: false, kind: "boolean", defaultValue: "false", acceptedValue: "true"},
                ],
            },
        ],
    },
    {
        name: "diff",
        description: "Compare two pokie sim JSON reports (see pokie sim --out) and highlight what changed.",
        verbs: [
            {
                verb: undefined,
                usage: "Usage: pokie diff <leftReportJson> <rightReportJson> [--format json] [--out <file>]",
                positionals: ["leftReportJson", "rightReportJson"],
                options: [
                    // --format has no dependency seam (it only chooses console.log(json) vs printSummary(diff), and
                    // the extra "Diff written" line is guarded by `format !== "json"`), so its value is observed via
                    // the same deterministic stdout shape the dispatch contract already verifies -- see
                    // observeFormatFromStdout() in the contract test.
                    {flag: "--format", required: false, kind: "validated", defaultValue: "summary", acceptedValue: "json"},
                    {flag: "--out", required: false, kind: "unvalidated", defaultValue: "undefined", acceptedValue: "diff-out.json"},
                ],
            },
        ],
    },
    {
        name: "fairness",
        description:
            "Provably Fair commit-reveal workflow: publish a server-seed commitment, publish a round commitment " +
            "against a live outcome-library bundle, reveal the round proof, and verify a proof against its " +
            'commitment/bundle ("pokie fairness seed-commit|commit|reveal|verify").',
        verbs: [
            {
                verb: "seed-commit",
                usage: "Usage: pokie fairness seed-commit <serverSeed.txt> [--out <file>] [--overwrite]",
                positionals: ["serverSeed.txt"],
                options: [
                    {flag: "--out", required: false, kind: "unvalidated", defaultValue: "undefined", acceptedValue: "commitment-out.json"},
                    {flag: "--overwrite", required: false, kind: "boolean", defaultValue: "false", acceptedValue: "true"},
                ],
            },
            {
                verb: "commit",
                usage:
                    "Usage: pokie fairness commit <serverSeedCommitment.json> --client-seed <seed> --nonce <n> --source <bundleDir> " +
                    "--mode <modeName> [--out <file>] [--overwrite]",
                positionals: ["serverSeedCommitment.json"],
                options: [
                    {flag: "--client-seed", required: true, kind: "unvalidated", acceptedValue: "player-seed"},
                    {flag: "--nonce", required: true, kind: "validated", acceptedValue: "0"},
                    {flag: "--source", required: true, kind: "unvalidated", acceptedValue: "bundleDir"},
                    {flag: "--mode", required: true, kind: "unvalidated", acceptedValue: "base"},
                    {flag: "--out", required: false, kind: "unvalidated", defaultValue: "undefined", acceptedValue: "commit-out.json"},
                    {flag: "--overwrite", required: false, kind: "boolean", defaultValue: "false", acceptedValue: "true"},
                ],
            },
            {
                verb: "reveal",
                usage:
                    "Usage: pokie fairness reveal <commitment.json> --server-seed <serverSeed.txt> --source <bundleDir> [--out <file>] [--overwrite]",
                positionals: ["commitment.json"],
                options: [
                    {flag: "--server-seed", required: true, kind: "unvalidated", acceptedValue: "serverSeed.txt"},
                    {flag: "--source", required: true, kind: "unvalidated", acceptedValue: "bundleDir"},
                    {flag: "--out", required: false, kind: "unvalidated", defaultValue: "undefined", acceptedValue: "reveal-out.json"},
                    {flag: "--overwrite", required: false, kind: "boolean", defaultValue: "false", acceptedValue: "true"},
                ],
            },
            {
                verb: "verify",
                usage: "Usage: pokie fairness verify <proof.json> --commitment <commitment.json> --source <bundleDir>",
                positionals: ["proof.json"],
                options: [
                    {flag: "--commitment", required: true, kind: "unvalidated", acceptedValue: "commitment.json"},
                    {flag: "--source", required: true, kind: "unvalidated", acceptedValue: "bundleDir"},
                ],
            },
        ],
    },
    {
        name: "init",
        description:
            'Create a prepared, immediately valid POKIE game package from "<name>": a real, editable ' +
            'src/index.ts a developer owns, generated and verified on the spot, no separate npm install/build ' +
            'step required -- the "programmer-first" package workflow. Run with no name for the same ' +
            'interactive wizard "pokie create" offers. For an editable GameBlueprint JSON file instead, use ' +
            '"pokie create".',
        // No declared options -- "[name]" is its one positional, optional (no name launches the
        // interactive wizard instead, itself fully dependency-injectable, so there's still an
        // executable "valid" case below without touching real stdin/this repo's own working directory).
        verbs: [{verb: undefined, usage: "Usage: pokie init [name]", positionals: ["name (optional)"], options: []}],
    },
    {
        name: "inspect",
        description: "Print a package's package.json (name, version, description) without running it.",
        verbs: [{verb: undefined, usage: "Usage: pokie inspect <packageRoot>", positionals: ["packageRoot"], options: []}],
    },
    {
        name: "name",
        description:
            "Generate deterministic, offline slot game name(s) from SlotGameNameGenerator " +
            '("pokie name [--count <n>] [--theme <theme>] [--words <2|3>] [--seed <n>] [--json]").',
        verbs: [
            {
                verb: undefined,
                usage: "Usage: pokie name [--count <n>] [--theme <theme>] [--words <2|3>] [--seed <integer>] [--json]",
                positionals: [],
                options: [
                    {flag: "--count", required: false, kind: "validated", defaultValue: "1", acceptedValue: "2"},
                    // acceptedValue is ALL_SLOT_GAME_NAME_THEMES[0] (the same value the accepted-values case passes),
                    // observed at the generator's generateUnique(count, request).theme.
                    {flag: "--theme", required: false, kind: "validated", defaultValue: "undefined", acceptedValue: ALL_SLOT_GAME_NAME_THEMES[0]},
                    {flag: "--words", required: false, kind: "validated", defaultValue: "undefined", acceptedValue: "3"},
                    {flag: "--seed", required: false, kind: "validated", defaultValue: "undefined", acceptedValue: "555"},
                    // --json has no dependency seam (it only chooses console.log(JSON.stringify(...)) vs printHuman(...),
                    // unrelated to generateUnique's arguments), so it's observed via the deterministic stdout shape the
                    // dispatch contract already verifies -- see observeFormatFromStdout() in the contract test.
                    {flag: "--json", required: false, kind: "boolean", defaultValue: "false", acceptedValue: "true"},
                ],
            },
        ],
    },
    {
        name: "outcomelibrary",
        description:
            "Generate a WeightedOutcomeLibrary from a built package's own runtime (exact reel-stop enumeration), or " +
            "build a canonical outcome-library persistence bundle from WeightedOutcomeLibrary JSON files, or validate one " +
            '("pokie outcomelibrary generate <packageRoot>" / "pokie outcomelibrary build <config.json>" / ' +
            '"pokie outcomelibrary validate <bundleDir>").',
        verbs: [
            {
                verb: "build",
                usage: "Usage: pokie outcomelibrary build <config.json> [--out <dir>]",
                positionals: ["config.json"],
                // defaultValue "outcomelibrary": path.join(path.dirname(configPath), "outcomelibrary") with configPath
                // "config.json" resolves to "outcomelibrary", observed at writer.writeToDirectory's own outDir argument.
                options: [{flag: "--out", required: false, kind: "unvalidated", defaultValue: "outcomelibrary", acceptedValue: "custom-outcomelib-dir"}],
            },
            {
                verb: "validate",
                usage: "Usage: pokie outcomelibrary validate <bundleDir> [--deep]",
                positionals: ["bundleDir"],
                options: [{flag: "--deep", required: false, kind: "boolean", defaultValue: "false", acceptedValue: "true"}],
            },
            {
                verb: "generate",
                usage:
                    "Usage: pokie outcomelibrary generate <packageRoot> [--mode <betModeId>] [--stake <number>] " +
                    "[--config-hash <hash>] [--library-id <id>] [--max-outcome-space-size <n>] " +
                    "[--bounded --sample-size <n> --seed <string>] [--estimate | --dry-run] [--out <file>] " +
                    "[--resume <file>] [--progress] [--format json]",
                positionals: ["packageRoot"],
                options: [
                    {flag: "--mode", required: false, kind: "unvalidated", defaultValue: "undefined", acceptedValue: "base"},
                    {flag: "--stake", required: false, kind: "validated", defaultValue: "undefined", acceptedValue: "1.5"},
                    {flag: "--config-hash", required: false, kind: "unvalidated", defaultValue: "undefined", acceptedValue: "sha256:abc"},
                    // defaultValue "fixture-slot": with no --mode/--library-id, executeGenerate derives libraryId from
                    // the loaded game's own manifest.id alone (see OutcomeLibraryCommand's own comment) -- observed at
                    // the injected generate() call's own options.libraryId.
                    {flag: "--library-id", required: false, kind: "unvalidated", defaultValue: "fixture-slot", acceptedValue: "custom-lib"},
                    {flag: "--max-outcome-space-size", required: false, kind: "validated", defaultValue: "undefined", acceptedValue: "1000000"},
                    {flag: "--bounded", required: false, kind: "boolean", defaultValue: "false", acceptedValue: "true"},
                    // --sample-size/--seed are only meaningfully required together with --bounded (a cross-field,
                    // all-or-nothing group, already frozen by this file's own dedicated group-level invalid cases) --
                    // same "grouped" convention as sim's own --min-rounds/--rtp-tolerance/--check-interval/--stable-checks.
                    {flag: "--sample-size", required: false, kind: "grouped", defaultValue: "undefined", acceptedValue: "1000"},
                    {flag: "--seed", required: false, kind: "grouped", defaultValue: "undefined", acceptedValue: "seed-1"},
                    // --estimate/--dry-run have no dependency-argument seam of their own (both short-circuit to the
                    // same estimateSpace probe, observed inline from that stub); default "false" is observed from
                    // inside the real generate() stub instead, since reaching it at all proves neither flag fired.
                    {flag: "--estimate", required: false, kind: "boolean", defaultValue: "false", acceptedValue: "true"},
                    {flag: "--dry-run", required: false, kind: "boolean", defaultValue: "false", acceptedValue: "true"},
                    // defaultValue "undefined": no --out means printGenerateResult never calls writeFile at all --
                    // observed via deferValueUnlessCalled, same convention as replay/report/par's own --out.
                    {flag: "--out", required: false, kind: "unvalidated", defaultValue: "undefined", acceptedValue: "out.json"},
                    // defaultValue "undefined": no --resume means fileExists(options.resume) is never called at all
                    // (guarded on options.resume !== undefined) -- observed via deferValueUnlessCalled.
                    {flag: "--resume", required: false, kind: "unvalidated", defaultValue: "undefined", acceptedValue: "checkpoint.json"},
                    {flag: "--progress", required: false, kind: "boolean", defaultValue: "false", acceptedValue: "true"},
                    // --format has no dependency seam (json vs the human summary) -- observed via stdout shape, same
                    // STDOUT_FORMAT_FLAGS convention diff/par/sim/stakeengine/validate already use.
                    {flag: "--format", required: false, kind: "validated", defaultValue: "summary", acceptedValue: "json"},
                ],
            },
        ],
    },
    {
        name: "par",
        description:
            'Import/export a GameBlueprint to/from a PAR sheet XLSX workbook ("pokie par import <input.xlsx>" / "pokie par export <config.json>").',
        verbs: [
            {
                verb: "import",
                usage: "Usage: pokie par import <input.xlsx> [--out <blueprint.json>] [--format json]",
                positionals: ["input.xlsx"],
                options: [
                    // defaultValue "input.blueprint.json": defaultBlueprintPath("input.xlsx") resolves there, observed
                    // at writeFile's own path argument.
                    {flag: "--out", required: false, kind: "unvalidated", defaultValue: "input.blueprint.json", acceptedValue: "custom-blueprint-out.json"},
                    // --format has no dependency seam (json vs printImportSummary; writeFile runs either way and the
                    // "Wrote blueprint" line is guarded by `format !== "json"`) -- observed via stdout shape.
                    {flag: "--format", required: false, kind: "validated", defaultValue: "summary", acceptedValue: "json"},
                ],
            },
            {
                verb: "export",
                usage: "Usage: pokie par export <config.json> [--out <output.xlsx>]",
                positionals: ["config.json"],
                // defaultValue "config.par.xlsx": defaultParSheetPath("config.json") resolves there, observed at
                // exporter.exportToFile's own outPath argument.
                options: [{flag: "--out", required: false, kind: "unvalidated", defaultValue: "config.par.xlsx", acceptedValue: "custom-output.xlsx"}],
            },
        ],
    },
    {
        name: "reel",
        description:
            'Generate one or every "generated" reel a Blueprint Project\'s reelStripGeneration declares, via the ' +
            "same ReelStripGenerator/constraints/presets \"pokie build\" already runs -- a deterministic preview/diff " +
            'by default, only pinning the result back in as a literal strip with --apply ("pokie reel generate ' +
            '<blueprint.json> [--reel <index>] [--seed <integer>] [--apply] [--out <file>] [--format json]").',
        verbs: [
            {
                verb: "generate",
                usage: "Usage: pokie reel generate <blueprint.json> [--reel <index>] [--seed <integer>] [--apply] [--out <file>] [--format json]",
                positionals: ["blueprint.json"],
                options: [
                    // defaultValue "2": with no --reel, every "generated" reel is targeted in ascending order (the
                    // fixture blueprint's own reelStripGeneration has reel 1 then reel 2 generated) -- observed at
                    // the injected resolveGeneration's own reelIndex argument, last-write-wins across both calls.
                    {flag: "--reel", required: false, kind: "validated", defaultValue: "2", acceptedValue: "1"},
                    // defaultValue "43": with no --seed, each targeted reel's own authored seed is used unchanged --
                    // observed the same way as --reel (last-write-wins), so it's reel 2's own fixture seed (43).
                    {flag: "--seed", required: false, kind: "validated", defaultValue: "43", acceptedValue: "999"},
                    {flag: "--apply", required: false, kind: "boolean", defaultValue: "false", acceptedValue: "true"},
                    // defaultValue "undefined": no --apply means writeFile is never called at all -- observed via
                    // deferValueUnlessCalled, same convention as replay/report/par/fairness's own --out.
                    {flag: "--out", required: false, kind: "unvalidated", defaultValue: "undefined", acceptedValue: "custom.json"},
                    // --format has no dependency seam (json vs the human summary) -- observed via stdout shape, same
                    // STDOUT_FORMAT_FLAGS convention diff/par/sim/stakeengine/validate already use.
                    {flag: "--format", required: false, kind: "validated", defaultValue: "summary", acceptedValue: "json"},
                ],
            },
        ],
    },
    {
        name: "replay",
        description: "Best-effort replay of a single round (by seed + round index) from a POKIE game package.",
        verbs: [
            {
                verb: undefined,
                usage: "Usage: pokie replay <packageRoot> --round <number> [--seed <string>] [--out <file>] [--format json]",
                positionals: ["packageRoot"],
                options: [
                    {flag: "--round", required: true, kind: "validated", acceptedValue: "3"},
                    {flag: "--seed", required: false, kind: "unvalidated", defaultValue: "undefined", acceptedValue: "demo-seed"},
                    {flag: "--out", required: false, kind: "unvalidated", defaultValue: "undefined", acceptedValue: "replay-out.json"},
                    // --format is validated-but-inert: parseArgs rejects anything other than "json" but never stores
                    // the parsed value, and run() always prints the replay JSON unconditionally -- so accepted and
                    // default are the same observable "json" (not a copy-paste mistake). Observed via stdout shape.
                    {flag: "--format", required: false, kind: "validated", defaultValue: "json", acceptedValue: "json"},
                ],
            },
        ],
    },
    {
        name: "report",
        description: "Render a pokie sim JSON report (see pokie sim --out) as a human-readable Markdown or HTML document.",
        verbs: [
            {
                verb: undefined,
                usage: "Usage: pokie report <simulationReportJson> [--format markdown|html] [--out <file>]",
                positionals: ["simulationReportJson"],
                options: [
                    // --format has a real seam: renderers.markdown/renderers.html are two independently swappable
                    // dependencies, and which one's render() actually fires is the observed evidence.
                    {flag: "--format", required: false, kind: "validated", defaultValue: "markdown", acceptedValue: "html"},
                    {flag: "--out", required: false, kind: "unvalidated", defaultValue: "undefined", acceptedValue: "report-out.html"},
                ],
            },
        ],
    },
    {
        name: "serve",
        description: "Experimental: serve a POKIE game package over local HTTP (dev/reference server, not a casino backend/RGS).",
        verbs: [
            {
                verb: undefined,
                usage: "Usage: pokie serve <packageRoot> [--port <number>] [--host <string>]",
                positionals: ["packageRoot"],
                options: [
                    {flag: "--port", required: false, kind: "validated", defaultValue: "undefined", acceptedValue: "4321"},
                    {flag: "--host", required: false, kind: "unvalidated", defaultValue: "undefined", acceptedValue: "0.0.0.0"},
                ],
            },
        ],
    },
    {
        name: "sim",
        description: "Run a simulation against a POKIE game package and report RTP/hit-frequency/max win.",
        verbs: [
            {
                verb: undefined,
                usage:
                    "Usage: pokie sim <packageRoot> [--rounds <number>] [--seed <string>] [--workers <number>] " +
                    "[--mode <betModeId>|all] [--out <file>] [--format json] " +
                    "[--min-rounds <number> --rtp-tolerance <number> --check-interval <number> [--stable-checks <number>]]",
                positionals: ["packageRoot"],
                options: [
                    // defaultValue is SimulationConfig.DEFAULT_NUMBER_OF_ROUNDS (SimCommand.parseArgs's own default),
                    // observed at createParallelSimulationRunner's rounds argument.
                    {flag: "--rounds", required: false, kind: "validated", defaultValue: String(SimulationConfig.DEFAULT_NUMBER_OF_ROUNDS), acceptedValue: "500"},
                    {flag: "--seed", required: false, kind: "unvalidated", defaultValue: "undefined", acceptedValue: "demo"},
                    {flag: "--workers", required: false, kind: "validated", defaultValue: "1", acceptedValue: "2"},
                    {flag: "--mode", required: false, kind: "unvalidated", defaultValue: "undefined", acceptedValue: "base"},
                    {flag: "--out", required: false, kind: "unvalidated", defaultValue: "undefined", acceptedValue: "sim-out.json"},
                    // --format has no dependency seam (json vs printSummary; the "Report written" line is guarded by
                    // the non-json branch) -- observed via stdout shape.
                    {flag: "--format", required: false, kind: "validated", defaultValue: "summary", acceptedValue: "json"},
                    // The four convergence flags reach options.convergence.{minRounds,rtpTolerance,checkIntervalRounds,
                    // stableChecks} on the same createParallelSimulationRunner call; convergence stays `undefined` (so
                    // each field observes "undefined") unless the whole group is given.
                    {flag: "--min-rounds", required: false, kind: "grouped", defaultValue: "undefined", acceptedValue: "1000"},
                    {flag: "--rtp-tolerance", required: false, kind: "grouped", defaultValue: "undefined", acceptedValue: "0.5"},
                    {flag: "--check-interval", required: false, kind: "grouped", defaultValue: "undefined", acceptedValue: "100"},
                    {flag: "--stable-checks", required: false, kind: "grouped", defaultValue: "undefined", acceptedValue: "2"},
                ],
            },
        ],
    },
    {
        name: "stakeengine",
        description:
            "Export WeightedOutcomeLibrary JSON files to the Stake Engine math-sdk static file format, import one back, " +
            "standalone-analyze an arbitrary Stake Engine outcome directory with no pokie-manifest.json required, or diff " +
            "two such directories/analyses " +
            '("pokie stakeengine export <config.json>" / "pokie stakeengine import <stakeDir>" / ' +
            '"pokie stakeengine analyze <stakeDir>" / "pokie stakeengine diff <leftStakeDir> <rightStakeDir>").',
        verbs: [
            {
                verb: "export",
                usage: "Usage: pokie stakeengine export <config.json> [--out <dir>]",
                positionals: ["config.json"],
                // defaultValue "stakeengine": path.join(path.dirname(configPath), "stakeengine") resolves there,
                // observed at exporter.exportToDirectory's own outDir argument.
                options: [{flag: "--out", required: false, kind: "unvalidated", defaultValue: "stakeengine", acceptedValue: "custom-stakeengine-out"}],
            },
            {
                verb: "import",
                usage: "Usage: pokie stakeengine import <stakeDir> [--out <dir>]",
                positionals: ["stakeDir"],
                // defaultValue "stakeDir-imported": path.join(path.dirname(stakeDir), `${path.basename(stakeDir)}-imported`)
                // with stakeDir "stakeDir" resolves there, observed at importWriter.writeToDirectory's own outDir argument.
                options: [{flag: "--out", required: false, kind: "unvalidated", defaultValue: "stakeDir-imported", acceptedValue: "custom-stakeengine-import-out"}],
            },
            {
                verb: "analyze",
                usage: "Usage: pokie stakeengine analyze <stakeDir> [--format json] [--out <file>]",
                positionals: ["stakeDir"],
                options: [
                    // --format has no dependency seam (json vs printAnalyzeSummary; the "Report written" line is guarded
                    // by the non-json branch) -- observed via stdout shape.
                    {flag: "--format", required: false, kind: "validated", defaultValue: "summary", acceptedValue: "json"},
                    {flag: "--out", required: false, kind: "unvalidated", defaultValue: "undefined", acceptedValue: "analyze-out.json"},
                ],
            },
            {
                // Exit codes are the diff(1) convention (0 identical, 1 differs, 2 trouble) — the one
                // pokie CLI subcommand that deliberately doesn't use plain 0-success/1-error.
                verb: "diff",
                usage: "Usage: pokie stakeengine diff <leftStakeDir> <rightStakeDir> [--format json] [--out <file>]",
                positionals: ["leftStakeDir", "rightStakeDir"],
                options: [
                    // --format has no dependency seam (json vs printDiffSummary; the "Diff written" line is guarded by
                    // the non-json branch) -- observed via stdout shape.
                    {flag: "--format", required: false, kind: "validated", defaultValue: "summary", acceptedValue: "json"},
                    {flag: "--out", required: false, kind: "unvalidated", defaultValue: "undefined", acceptedValue: "diff-out.json"},
                ],
            },
        ],
    },
    {
        name: "studio",
        description: "Launch POKIE Studio, a local web app for creating/opening/inspecting game packages.",
        verbs: [
            {
                verb: undefined,
                usage: "Usage: pokie studio [projectRoot] [--port <number>] [--host <string>] [--no-open]",
                positionals: ["projectRoot (optional)"],
                options: [
                    {flag: "--port", required: false, kind: "validated", defaultValue: "undefined", acceptedValue: "7000"},
                    {flag: "--host", required: false, kind: "unvalidated", defaultValue: "undefined", acceptedValue: "0.0.0.0"},
                    {flag: "--no-open", required: false, kind: "boolean", defaultValue: "false", acceptedValue: "true"},
                ],
            },
        ],
    },
    {
        name: "validate",
        description: "Validate a POKIE game package's contract (manifest, entry module) without playing it.",
        verbs: [
            {
                verb: undefined,
                usage: "Usage: pokie validate <packageRoot> [--format json] [--out <file>]",
                positionals: ["packageRoot"],
                options: [
                    // --format has no dependency seam (json vs printSummary; the "Report written" line is guarded by
                    // the non-json branch) -- observed via stdout shape.
                    {flag: "--format", required: false, kind: "validated", defaultValue: "summary", acceptedValue: "json"},
                    {flag: "--out", required: false, kind: "unvalidated", defaultValue: "undefined", acceptedValue: "validate-out.json"},
                ],
            },
        ],
    },
];

export type CliContractCase = {
    command: string;
    // Unique within `command` — used both as the jest.each case title and as the lookup key
    // cliCommandInventory.contract.test.ts's registerCommandsForValidCases() uses to find the one
    // stubbed command instance built for this exact case.
    label: string;
    kind: "invalid" | "valid";
    // Args as dispatch() receives them once the command name itself has already been resolved,
    // i.e. `["node", "pokie", command, ...args]`.
    args: string[];
    expectedExitCode: number;
    // "invalid": the exact message dispatch prints to stderr; nothing is ever printed to stdout.
    expectedError?: string;
    // "valid": what shape stdout has. "json" asserts the entire stdout is exactly one
    // JSON.parse-able value (never split across multiple console.log calls); "text" asserts at
    // least one non-empty human-readable line was printed; console.error is never called on a
    // "valid" case either way.
    expectStdout?: "json" | "text";
};

// Every "invalid" case here freezes a rejected argv (a missing required positional/subcommand, or a
// bad flag value) with the exact error message it throws today; every "valid" case freezes an
// accepted argv — a default, or a documented option value — with the exit code and stdout shape it
// actually produces. At least one of each exists for every verb of every public command (see the
// coverage assertions in cliCommandInventory.contract.test.ts), and "valid" cases are chosen, where a
// command supports it, to exercise its "--format json"/"--json" output shape rather than its
// human-readable summary, so CLI_CONTRACT_CASES also demonstrates the machine-readable contract, not
// only the human-readable one.
//
// Beyond that per-command coverage, cliCommandInventory.contract.test.ts's own "CLI option contract
// coverage" describe block walks every option of every CLI_COMMAND_DESCRIPTORS verb and requires,
// depending on that option's own CliOptionKind: an "accepted" case (always), a "default"/omitted case
// (whenever the option isn't required), a "required-missing" case (whenever it is), and a
// "rejected-value" case (whenever its kind is "validated"). Every option below satisfies that
// derived requirement — see that describe block for exactly what's checked and why.
export const CLI_CONTRACT_CASES: CliContractCase[] = [
    // --- build ---
    {
        command: "build",
        kind: "invalid",
        label: "missing <config.json> (an empty-string positional, since a truly empty argv launches the wizard instead)",
        args: [""],
        expectedExitCode: 1,
        expectedError:
            "Usage: pokie build <config.json> [--target <dir>] [--dry-run]\n" +
            "<config.json> is a GameBlueprint (manifest, reels, rows, symbols, paytable, ...) — see docs/cli.md#pokie-build-configjson for the format.",
    },
    {
        // Placed before the --dry-run case so it is the case groupCasesByVerb().valid.find() picks as the
        // default (omitted) evidence for both --target and --dry-run: a non-dry-run build with no --target, whose
        // injected generator therefore actually runs with outDir === undefined (String(undefined) === "undefined")
        // and whose being-called-at-all is --dry-run's own "false" evidence.
        command: "build",
        kind: "valid",
        label: "<config.json> (no --target, no --dry-run — writes via the injected generator using its own default output directory)",
        args: ["config.json"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "build",
        kind: "valid",
        label: "<config.json> --dry-run validates and previews without writing anything (default, no --target)",
        args: ["config.json", "--dry-run"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "build",
        kind: "valid",
        label: "<config.json> --target <dir> (accepted --target value, default --dry-run, writes via the injected generator)",
        args: ["config.json", "--target", "customOutDir"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "build",
        kind: "invalid",
        label: "--init-blueprint missing <file>",
        args: ["--init-blueprint"],
        expectedExitCode: 1,
        expectedError: "Usage: pokie build --init-blueprint <file>",
    },
    {
        command: "build",
        kind: "valid",
        label: "--init-blueprint <file> writes the starter blueprint template",
        args: ["--init-blueprint", "starter-blueprint.json"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "build",
        kind: "invalid",
        label: "random --seed must be an integer",
        args: ["random", "--seed", "notanumber"],
        expectedExitCode: 1,
        expectedError:
            "--seed requires an integer value. Usage: pokie build random [--seed <integer>] [--target <dir>] [--dry-run] [--preset default|variant]",
    },
    {
        command: "build",
        kind: "invalid",
        label: "random --preset must be default|variant",
        args: ["random", "--seed", "1", "--preset", "bogus"],
        expectedExitCode: 1,
        expectedError:
            "--preset must be one of: default, variant. Usage: pokie build random [--seed <integer>] [--target <dir>] [--dry-run] [--preset default|variant]",
    },
    {
        // Placed before every other "random" case so it wins the default (omitted) evidence for --target,
        // --seed, and --preset all at once: it's a genuine non-dry-run random build (--dry-run's own default
        // evidence is read from stdout, see STDOUT_BOOLEAN_MARKER_FLAGS, so it doesn't need this case's help),
        // so GamePackageGenerating.generate() actually runs with outDir undefined, unlike every other case here
        // that omits --target but is also a --dry-run build (where generate() never runs at all, so --target's value
        // can't be observed).
        command: "build",
        kind: "valid",
        label: "random (no flags at all -- default --seed/--target/--dry-run/--preset, writes via the injected generator, runs the smoke simulation)",
        args: ["random"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "build",
        kind: "valid",
        label: "random --seed <integer> --preset variant --dry-run (accepted --preset value)",
        args: ["random", "--seed", "4242", "--preset", "variant", "--dry-run"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        // Placed before the "random --target <dir> --dry-run" case so it wins the accepted-value lookup for random's
        // --target (that dry-run case never calls GamePackageGenerating.generate, so --target's value cannot be observed
        // there) and is also the default (omitted) evidence for random's --dry-run (a non-dry-run random build
        // whose generator actually runs; it also runs the post-build smoke simulation, which every random build
        // does when a seed is present).
        command: "build",
        kind: "valid",
        label: "random --seed <integer> --target <dir> (accepted --target value while --dry-run defaults to false, writes via the injected generator, runs the smoke simulation)",
        args: ["random", "--seed", "999", "--target", "random-accepted-out-dir"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "build",
        kind: "valid",
        label: "random --target <dir> --dry-run (accepted --target value, default --seed/--preset)",
        args: ["random", "--target", "random-out-dir", "--dry-run"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "build",
        kind: "valid",
        label: "random --seed <integer> (default --dry-run/--target/--preset, writes via the injected generator, runs the smoke simulation)",
        args: ["random", "--seed", "777"],
        expectedExitCode: 0,
        expectStdout: "text",
    },

    // --- certification ---
    {
        command: "certification",
        kind: "invalid",
        label: "missing/unknown subcommand",
        args: [],
        expectedExitCode: 1,
        expectedError:
            "Usage: pokie certification build <bundleDir> <config.json> [--out <dir>]\n" +
            "   or: pokie certification verify <certDir> --source <bundleDir>\n" +
            '<config.json> lists one sample source per mode of the given outcome-library bundle — {"modes": ' +
            '[{"modeName": "base", "seed": "cert-2026-07-15-base", "sampleCount": 200}, ...]} — see ' +
            "docs/certification-evidence-bundle.md for the format.",
    },
    {
        command: "certification",
        kind: "invalid",
        label: "build missing <bundleDir>/<config.json>",
        args: ["build"],
        expectedExitCode: 1,
        expectedError:
            "Usage: pokie certification build <bundleDir> <config.json> [--out <dir>]\n" +
            '<config.json> lists one sample source per mode of the given outcome-library bundle — {"modes": ' +
            '[{"modeName": "base", "seed": "cert-2026-07-15-base", "sampleCount": 200}, ...]} — see ' +
            "docs/certification-evidence-bundle.md for the format.",
    },
    {
        command: "certification",
        kind: "valid",
        label: "build <bundleDir> <config.json> (default --out)",
        args: ["build", "bundleDir", "config.json"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "certification",
        kind: "valid",
        label: "build <bundleDir> <config.json> --out <dir> (accepted --out value)",
        args: ["build", "bundleDir", "config.json", "--out", "customCertOut"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "certification",
        kind: "invalid",
        label: "verify missing <certDir>",
        args: ["verify"],
        expectedExitCode: 1,
        expectedError: "Usage: pokie certification verify <certDir> --source <bundleDir>",
    },
    {
        command: "certification",
        kind: "invalid",
        label: "verify missing --source (certDir given)",
        args: ["verify", "certDir"],
        expectedExitCode: 1,
        expectedError: "--source <bundleDir> is required. Usage: pokie certification verify <certDir> --source <bundleDir>",
    },
    {
        command: "certification",
        kind: "valid",
        label: "verify <certDir> --source <bundleDir>",
        args: ["verify", "certDir", "--source", "bundleDir"],
        expectedExitCode: 0,
        expectStdout: "text",
    },

    // --- client ---
    {
        command: "client",
        kind: "invalid",
        label: "missing <packageRoot>",
        args: [],
        expectedExitCode: 1,
        expectedError:
            "Usage: pokie client <packageRoot> [--port <number>] [--host <string>] [--api-host <string>] [--api-port <number>]",
    },
    {
        command: "client",
        kind: "invalid",
        label: "--port must be a non-negative integer",
        args: ["pkg", "--port", "-1"],
        expectedExitCode: 1,
        expectedError:
            "--port must be a non-negative integer. Usage: pokie client <packageRoot> [--port <number>] [--host <string>] [--api-host <string>] [--api-port <number>]",
    },
    {
        command: "client",
        kind: "invalid",
        label: "--api-port must be a non-negative integer",
        args: ["pkg", "--api-port", "-1"],
        expectedExitCode: 1,
        expectedError:
            "--api-port must be a non-negative integer. Usage: pokie client <packageRoot> [--port <number>] [--host <string>] [--api-host <string>] [--api-port <number>]",
    },
    {
        command: "client",
        kind: "valid",
        label: "<packageRoot> (default host/port)",
        args: ["pkg"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "client",
        kind: "valid",
        label: "<packageRoot> --port --host --api-host --api-port (accepted values)",
        args: ["pkg", "--port", "4444", "--host", "0.0.0.0", "--api-host", "10.0.0.1", "--api-port", "3001"],
        expectedExitCode: 0,
        expectStdout: "text",
    },

    // --- create ---
    {
        command: "create",
        kind: "valid",
        label: "(no name, no options, interactive terminal — runs the wizard, default destination)",
        args: [],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "create",
        kind: "valid",
        label: "<name> (interactive terminal — the wizard runs with the name pre-filled)",
        args: ["sample-slot"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "create",
        kind: "valid",
        label: "--out <file> (accepted --out value, interactive terminal)",
        args: ["--out", "custom-blueprint-out.json"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "create",
        kind: "valid",
        label: "--blank (writes the blank template directly, no wizard)",
        args: ["--blank"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "create",
        kind: "valid",
        label: "--blank --out <file> (accepted --out value)",
        args: ["--blank", "--out", "custom-blank-out.json"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "create",
        kind: "invalid",
        label: "--random --preset must be default|variant",
        args: ["--random", "--preset", "bogus"],
        expectedExitCode: 1,
        expectedError:
            "--preset must be one of: default, variant. " +
            "Usage: pokie create [name] --random [--seed <integer>] [--preset default|variant] [--out <file>]",
    },
    {
        command: "create",
        kind: "invalid",
        label: "--random --seed must be an integer",
        args: ["--random", "--seed", "notanumber"],
        expectedExitCode: 1,
        expectedError:
            "--seed requires an integer value. " +
            "Usage: pokie create [name] --random [--seed <integer>] [--preset default|variant] [--out <file>]",
    },
    {
        command: "create",
        kind: "valid",
        label: "--random --seed <integer> (accepted --seed value, default --preset, default --out)",
        args: ["--random", "--seed", "1"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "create",
        kind: "valid",
        label: "--random --preset variant (accepted --preset value, default --seed, default --out)",
        args: ["--random", "--preset", "variant"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "create",
        kind: "valid",
        label: "--random --out <file> (accepted --out value, default --seed, default --preset)",
        args: ["--random", "--out", "custom-random-out.blueprint.json"],
        expectedExitCode: 0,
        expectStdout: "text",
    },

    // --- dev ---
    {
        command: "dev",
        kind: "invalid",
        label: "missing <packageRoot>",
        args: [],
        expectedExitCode: 1,
        expectedError:
            "Usage: pokie dev <packageRoot> [--port <number>] [--host <string>] " +
            "[--client-port <number>] [--client-host <string>] [--no-open]",
    },
    {
        command: "dev",
        kind: "invalid",
        label: "--port must be a non-negative integer",
        args: ["pkg", "--port", "-2"],
        expectedExitCode: 1,
        expectedError:
            "--port must be a non-negative integer. Usage: pokie dev <packageRoot> [--port <number>] [--host <string>] " +
            "[--client-port <number>] [--client-host <string>] [--no-open]",
    },
    {
        command: "dev",
        kind: "invalid",
        label: "--client-port must be a non-negative integer",
        args: ["pkg", "--client-port", "abc"],
        expectedExitCode: 1,
        expectedError:
            "--client-port must be a non-negative integer. Usage: pokie dev <packageRoot> [--port <number>] [--host <string>] " +
            "[--client-port <number>] [--client-host <string>] [--no-open]",
    },
    {
        command: "dev",
        kind: "valid",
        label: "<packageRoot> --no-open (skips the accepted-but-unexercised browser-open step)",
        args: ["pkg", "--no-open"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "dev",
        kind: "valid",
        label: "<packageRoot> --port --host --client-port --client-host (accepted values, default --no-open)",
        args: ["pkg", "--port", "5001", "--host", "0.0.0.0", "--client-port", "5101", "--client-host", "0.0.0.0"],
        expectedExitCode: 0,
        expectStdout: "text",
    },

    // --- diff ---
    {
        command: "diff",
        kind: "invalid",
        label: "missing <rightReportJson>",
        args: ["left.json"],
        expectedExitCode: 1,
        expectedError: "Usage: pokie diff <leftReportJson> <rightReportJson> [--format json] [--out <file>]",
    },
    {
        command: "diff",
        kind: "invalid",
        label: "--format only supports json",
        args: ["left.json", "right.json", "--format", "html"],
        expectedExitCode: 1,
        expectedError:
            '--format only supports "json". Usage: pokie diff <leftReportJson> <rightReportJson> [--format json] [--out <file>]',
    },
    {
        command: "diff",
        kind: "valid",
        label: "<left> <right> --format json (accepted --format value, machine-readable shape)",
        args: ["left.json", "right.json", "--format", "json"],
        expectedExitCode: 0,
        expectStdout: "json",
    },
    {
        command: "diff",
        kind: "valid",
        label: "<left> <right> --out <file> (accepted --out value, default --format summary)",
        args: ["left.json", "right.json", "--out", "diff-out.json"],
        expectedExitCode: 0,
        expectStdout: "text",
    },

    // --- fairness ---
    {
        command: "fairness",
        kind: "invalid",
        label: "missing/unknown subcommand",
        args: [],
        expectedExitCode: 1,
        expectedError:
            "Usage: pokie fairness verify <proof.json> --commitment <commitment.json> --source <bundleDir>\n" +
            "   or: pokie fairness seed-commit <serverSeed.txt> [--out <file>] [--overwrite]\n" +
            "   or: pokie fairness commit <serverSeedCommitment.json> --client-seed <seed> --nonce <n> --source <bundleDir> --mode <modeName> [--out <file>] [--overwrite]\n" +
            "   or: pokie fairness reveal <commitment.json> --server-seed <serverSeed.txt> --source <bundleDir> [--out <file>] [--overwrite]",
    },
    {
        command: "fairness",
        kind: "invalid",
        label: "seed-commit missing <serverSeed.txt>",
        args: ["seed-commit"],
        expectedExitCode: 1,
        expectedError: "Usage: pokie fairness seed-commit <serverSeed.txt> [--out <file>] [--overwrite]",
    },
    {
        // Placed before the fully-default case below so it wins --overwrite's default (omitted) evidence: with
        // --out present, emit()'s `!overwrite && fileExists(out)` guard is genuinely reachable, unlike the
        // fully-default case (which also omits --out, so that guard can never fire regardless of --overwrite's
        // real value — see cliCommandInventory.contract.test.ts's own comment on this).
        command: "fairness",
        kind: "valid",
        label: "seed-commit <serverSeed.txt> --out <file> (accepted --out value, default --overwrite)",
        args: ["seed-commit", "serverSeed.txt", "--out", "commitment-out.json"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "fairness",
        kind: "valid",
        label: "seed-commit <serverSeed.txt> (default, no --out — prints the commitment JSON)",
        args: ["seed-commit", "serverSeed.txt"],
        expectedExitCode: 0,
        expectStdout: "json",
    },
    {
        command: "fairness",
        kind: "valid",
        label: "seed-commit <serverSeed.txt> --out --overwrite (accepted values)",
        args: ["seed-commit", "serverSeed.txt", "--out", "commitment-out.json", "--overwrite"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "fairness",
        kind: "invalid",
        label: "commit missing --client-seed (checked first among its required flags)",
        args: ["commit", "commitment.json"],
        expectedExitCode: 1,
        expectedError:
            "--client-seed <seed> is required. Usage: pokie fairness commit <serverSeedCommitment.json> --client-seed <seed> --nonce <n> " +
            "--source <bundleDir> --mode <modeName> [--out <file>] [--overwrite]",
    },
    {
        command: "fairness",
        kind: "invalid",
        label: "commit missing --nonce (client-seed/source/mode given)",
        args: ["commit", "commitment.json", "--client-seed", "x", "--source", "bundleDir", "--mode", "base"],
        expectedExitCode: 1,
        expectedError:
            "--nonce <number> is required. Usage: pokie fairness commit <serverSeedCommitment.json> --client-seed <seed> --nonce <n> " +
            "--source <bundleDir> --mode <modeName> [--out <file>] [--overwrite]",
    },
    {
        command: "fairness",
        kind: "invalid",
        label: "commit --nonce must be a canonical non-negative integer (no sign)",
        args: ["commit", "commitment.json", "--client-seed", "x", "--nonce", "-1"],
        expectedExitCode: 1,
        expectedError:
            '--nonce must be a canonical non-negative decimal integer (e.g. "0", "42" — no sign, decimal point, leading zero, ' +
            'or scientific/hex notation, and no larger than Number.MAX_SAFE_INTEGER), got "-1". Usage: pokie fairness commit ' +
            "<serverSeedCommitment.json> --client-seed <seed> --nonce <n> --source <bundleDir> --mode <modeName> [--out <file>] [--overwrite]",
    },
    {
        command: "fairness",
        kind: "invalid",
        label: "commit missing --source (client-seed/nonce/mode given)",
        args: ["commit", "commitment.json", "--client-seed", "x", "--nonce", "0", "--mode", "base"],
        expectedExitCode: 1,
        expectedError:
            "--source <bundleDir> is required. Usage: pokie fairness commit <serverSeedCommitment.json> --client-seed <seed> --nonce <n> " +
            "--source <bundleDir> --mode <modeName> [--out <file>] [--overwrite]",
    },
    {
        command: "fairness",
        kind: "invalid",
        label: "commit missing --mode (client-seed/nonce/source given)",
        args: ["commit", "commitment.json", "--client-seed", "x", "--nonce", "0", "--source", "bundleDir"],
        expectedExitCode: 1,
        expectedError:
            "--mode <modeName> is required. Usage: pokie fairness commit <serverSeedCommitment.json> --client-seed <seed> --nonce <n> " +
            "--source <bundleDir> --mode <modeName> [--out <file>] [--overwrite]",
    },
    {
        // Placed before the --overwrite-omitting "accepted --nonce" case below so it wins --overwrite's default
        // (omitted) evidence: with --out present, emit()'s `!overwrite && fileExists(out)` guard is genuinely
        // reachable (see seed-commit's own equivalent case above for why the fully --out-omitting case can't
        // provide this evidence).
        command: "fairness",
        kind: "valid",
        label: "commit <serverSeedCommitment.json> --client-seed --nonce --source --mode --out (accepted --out value, default --overwrite)",
        args: ["commit", "serverSeedCommitment.json", "--client-seed", "player-seed", "--nonce", "0", "--source", "bundleDir", "--mode", "base", "--out", "commit-out.json"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "fairness",
        kind: "valid",
        label: "commit <serverSeedCommitment.json> --client-seed --nonce --source --mode (accepted --nonce value)",
        args: ["commit", "serverSeedCommitment.json", "--client-seed", "player-seed", "--nonce", "0", "--source", "bundleDir", "--mode", "base"],
        expectedExitCode: 0,
        expectStdout: "json",
    },
    {
        command: "fairness",
        kind: "valid",
        label: "commit <serverSeedCommitment.json> --client-seed --nonce --source --mode --out --overwrite (accepted values)",
        args: [
            "commit",
            "serverSeedCommitment.json",
            "--client-seed",
            "player-seed",
            "--nonce",
            "0",
            "--source",
            "bundleDir",
            "--mode",
            "base",
            "--out",
            "commit-out.json",
            "--overwrite",
        ],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "fairness",
        kind: "invalid",
        label: "reveal missing --server-seed",
        args: ["reveal", "commitment.json"],
        expectedExitCode: 1,
        expectedError:
            "--server-seed <file> is required. Usage: pokie fairness reveal <commitment.json> --server-seed <serverSeed.txt> " +
            "--source <bundleDir> [--out <file>] [--overwrite]",
    },
    {
        command: "fairness",
        kind: "invalid",
        label: "reveal missing --source (server-seed given)",
        args: ["reveal", "commitment.json", "--server-seed", "serverSeed.txt"],
        expectedExitCode: 1,
        expectedError:
            "--source <bundleDir> is required. Usage: pokie fairness reveal <commitment.json> --server-seed <serverSeed.txt> " +
            "--source <bundleDir> [--out <file>] [--overwrite]",
    },
    {
        // Placed before the --overwrite-omitting "--server-seed --source" case below so it wins --overwrite's
        // default (omitted) evidence, for the same reachable-guard reason as seed-commit's/commit's own
        // equivalent cases above.
        command: "fairness",
        kind: "valid",
        label: "reveal <commitment.json> --server-seed --source --out (accepted --out value, default --overwrite)",
        args: ["reveal", "commitment.json", "--server-seed", "serverSeed.txt", "--source", "bundleDir", "--out", "reveal-out.json"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "fairness",
        kind: "valid",
        label: "reveal <commitment.json> --server-seed --source",
        args: ["reveal", "commitment.json", "--server-seed", "serverSeed.txt", "--source", "bundleDir"],
        expectedExitCode: 0,
        expectStdout: "json",
    },
    {
        command: "fairness",
        kind: "valid",
        label: "reveal <commitment.json> --server-seed --source --out --overwrite (accepted values)",
        args: ["reveal", "commitment.json", "--server-seed", "serverSeed.txt", "--source", "bundleDir", "--out", "reveal-out.json", "--overwrite"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "fairness",
        kind: "invalid",
        label: "verify missing --commitment",
        args: ["verify", "proof.json"],
        expectedExitCode: 1,
        expectedError:
            "--commitment <commitment.json> is required. Usage: pokie fairness verify <proof.json> --commitment <commitment.json> --source <bundleDir>",
    },
    {
        command: "fairness",
        kind: "invalid",
        label: "verify missing --source (commitment given)",
        args: ["verify", "proof.json", "--commitment", "commitment.json"],
        expectedExitCode: 1,
        expectedError:
            "--source <bundleDir> is required. Usage: pokie fairness verify <proof.json> --commitment <commitment.json> --source <bundleDir>",
    },
    {
        command: "fairness",
        kind: "valid",
        label: "verify <proof.json> --commitment --source",
        args: ["verify", "proof.json", "--commitment", "commitment.json", "--source", "bundleDir"],
        expectedExitCode: 0,
        expectStdout: "text",
    },

    // --- init ---
    // No declared options to freeze coverage for (see the CLI_COMMAND_DESCRIPTORS entry above) — its
    // one positional, "[name]", is optional, so neither of the two "valid" shapes below is invalid:
    // omitted, it launches the interactive wizard (itself fully dependency-injectable, so this is
    // exercisable without touching real stdin or this repo's own working directory); given, it runs
    // the same validate/generate/verify pipeline non-interactively. It still has its own invalid
    // shapes though — an unrecognized option, or more than one positional — same as "create"'s own.
    {
        command: "init",
        kind: "invalid",
        label: "unknown option",
        args: ["sample-slot", "--bogus"],
        expectedExitCode: 1,
        expectedError: 'Unknown option "--bogus". Usage: pokie init [name]',
    },
    {
        command: "init",
        kind: "invalid",
        label: "unexpected extra positional argument",
        args: ["name-one", "name-two"],
        expectedExitCode: 1,
        expectedError: 'Unexpected extra argument "name-two". Usage: pokie init [name]',
    },
    {
        command: "init",
        kind: "valid",
        label: "(no args — launches the interactive wizard via the injected wizard/prompt)",
        args: [],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "init",
        kind: "valid",
        label: "<name> (non-interactive path, no wizard involved)",
        args: ["sample-slot"],
        expectedExitCode: 0,
        expectStdout: "text",
    },

    // --- inspect ---
    {
        command: "inspect",
        kind: "invalid",
        label: "missing <packageRoot>",
        args: [],
        expectedExitCode: 1,
        expectedError: "Usage: pokie inspect <packageRoot>",
    },
    {
        command: "inspect",
        kind: "invalid",
        label: "unexpected extra argument",
        args: ["pkgRoot", "extra"],
        expectedExitCode: 1,
        expectedError: 'Unknown option "extra". Usage: pokie inspect <packageRoot>',
    },
    {
        command: "inspect",
        kind: "valid",
        label: "<packageRoot>",
        args: ["pkg"],
        expectedExitCode: 0,
        expectStdout: "text",
    },

    // --- name ---
    {
        command: "name",
        kind: "invalid",
        label: "--theme must be one of the declared themes",
        args: ["--theme", "not-a-real-theme"],
        expectedExitCode: 1,
        expectedError:
            `--theme must be one of: ${ALL_SLOT_GAME_NAME_THEMES.join(", ")}. ` +
            "Usage: pokie name [--count <n>] [--theme <theme>] [--words <2|3>] [--seed <integer>] [--json]",
    },
    {
        command: "name",
        kind: "invalid",
        label: "--words must be 2 or 3",
        args: ["--words", "4"],
        expectedExitCode: 1,
        expectedError:
            "--words must be 2 or 3. Usage: pokie name [--count <n>] [--theme <theme>] [--words <2|3>] [--seed <integer>] [--json]",
    },
    {
        command: "name",
        kind: "invalid",
        label: "--count must be a positive integer",
        args: ["--count", "0"],
        expectedExitCode: 1,
        expectedError:
            "--count requires a positive integer. Usage: pokie name [--count <n>] [--theme <theme>] [--words <2|3>] [--seed <integer>] [--json]",
    },
    {
        command: "name",
        kind: "invalid",
        label: "--seed must be an integer",
        args: ["--seed", "notanumber"],
        expectedExitCode: 1,
        expectedError:
            "--seed requires an integer value. Usage: pokie name [--count <n>] [--theme <theme>] [--words <2|3>] [--seed <integer>] [--json]",
    },
    {
        command: "name",
        kind: "valid",
        label: "(no args — default count 1, human-readable output)",
        args: [],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "name",
        kind: "valid",
        label: "--json (machine-readable shape)",
        args: ["--json"],
        expectedExitCode: 0,
        expectStdout: "json",
    },
    {
        command: "name",
        kind: "valid",
        label: "--count --theme --words --seed (accepted values)",
        args: ["--count", "2", "--theme", ALL_SLOT_GAME_NAME_THEMES[0], "--words", "3", "--seed", "555"],
        expectedExitCode: 0,
        expectStdout: "text",
    },

    // --- outcomelibrary ---
    {
        command: "outcomelibrary",
        kind: "invalid",
        label: "missing/unknown subcommand",
        args: [],
        expectedExitCode: 1,
        expectedError:
            "Usage: pokie outcomelibrary generate <packageRoot> [options]\n" +
            "   or: pokie outcomelibrary build <config.json> [--out <dir>]\n" +
            "   or: pokie outcomelibrary validate <bundleDir> [--deep]\n" +
            '<config.json> lists one outcome source per mode, either a plain WeightedOutcomeLibrary JSON file — ' +
            '{"modes": [{"modeName": "base", "libraryPath": "./libraries/base.json"}, ...]} — which is fully loaded into ' +
            'memory, or a streaming JSONL file of outcomes (one canonical {"id","weight","artifact"} record per line, ' +
            'not wrapped in a library object) for a mode too large to hold in memory at once — {"modeName": "bonus", ' +
            '"outcomesPath": "./outcomes-bonus.jsonl", "libraryId": "bonus-lib"} ("libraryId" is required for this form, ' +
            "since there's no wrapping library object to read it from; \"schemaVersion\" is optional). Exactly one of " +
            '"libraryPath"/"outcomesPath" is required per mode — see docs/outcome-library-bundle.md for the format.',
    },
    {
        command: "outcomelibrary",
        kind: "invalid",
        label: "build missing <config.json>",
        args: ["build"],
        expectedExitCode: 1,
        expectedError:
            "Usage: pokie outcomelibrary build <config.json> [--out <dir>]\n" +
            '<config.json> lists one outcome source per mode, either a plain WeightedOutcomeLibrary JSON file — ' +
            '{"modes": [{"modeName": "base", "libraryPath": "./libraries/base.json"}, ...]} — which is fully loaded into ' +
            'memory, or a streaming JSONL file of outcomes (one canonical {"id","weight","artifact"} record per line, ' +
            'not wrapped in a library object) for a mode too large to hold in memory at once — {"modeName": "bonus", ' +
            '"outcomesPath": "./outcomes-bonus.jsonl", "libraryId": "bonus-lib"} ("libraryId" is required for this form, ' +
            "since there's no wrapping library object to read it from; \"schemaVersion\" is optional). Exactly one of " +
            '"libraryPath"/"outcomesPath" is required per mode — see docs/outcome-library-bundle.md for the format.',
    },
    {
        command: "outcomelibrary",
        kind: "valid",
        label: "build <config.json> (default --out)",
        args: ["build", "config.json"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "outcomelibrary",
        kind: "valid",
        label: "build <config.json> --out <dir> (accepted --out value)",
        args: ["build", "config.json", "--out", "custom-outcomelib-dir"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "outcomelibrary",
        kind: "invalid",
        label: "validate missing <bundleDir>",
        args: ["validate"],
        expectedExitCode: 1,
        expectedError: "Usage: pokie outcomelibrary validate <bundleDir> [--deep]",
    },
    {
        command: "outcomelibrary",
        kind: "valid",
        label: "validate <bundleDir>",
        args: ["validate", "bundleDir"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "outcomelibrary",
        kind: "valid",
        label: "validate <bundleDir> --deep (accepted --deep flag)",
        args: ["validate", "bundleDir", "--deep"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "outcomelibrary",
        kind: "invalid",
        label: "generate missing <packageRoot>",
        args: ["generate"],
        expectedExitCode: 1,
        expectedError:
            "Usage: pokie outcomelibrary generate <packageRoot> [--mode <betModeId>] [--stake <number>] " +
            "[--config-hash <hash>] [--library-id <id>] [--max-outcome-space-size <n>] " +
            "[--bounded --sample-size <n> --seed <string>] [--estimate | --dry-run] [--out <file>] " +
            "[--resume <file>] [--progress] [--format json]\n" +
            '<packageRoot> is a package built by "pokie build" (or any package loadPokieGame() can require) whose game ' +
            "opts into exact enumeration via PokieGame.createExactEnumerationSession -- see docs/weighted-outcome-library.md#generation. " +
            "Drives the same session/win-calculation runtime a live round uses; a stateful/unbounded mechanic (e.g. free " +
            "games) has no exact strategy and fails closed instead of guessing.",
    },
    {
        command: "outcomelibrary",
        kind: "invalid",
        label: "generate --stake must be a positive number",
        args: ["generate", "pkg", "--stake", "0"],
        expectedExitCode: 1,
        expectedError:
            "--stake must be a positive number. Usage: pokie outcomelibrary generate <packageRoot> [--mode <betModeId>] " +
            "[--stake <number>] [--config-hash <hash>] [--library-id <id>] [--max-outcome-space-size <n>] " +
            "[--bounded --sample-size <n> --seed <string>] [--estimate | --dry-run] [--out <file>] " +
            "[--resume <file>] [--progress] [--format json]",
    },
    {
        command: "outcomelibrary",
        kind: "invalid",
        label: "generate --max-outcome-space-size must be a positive integer",
        args: ["generate", "pkg", "--max-outcome-space-size", "abc"],
        expectedExitCode: 1,
        expectedError:
            "--max-outcome-space-size must be a positive integer. Usage: pokie outcomelibrary generate <packageRoot> " +
            "[--mode <betModeId>] [--stake <number>] [--config-hash <hash>] [--library-id <id>] " +
            "[--max-outcome-space-size <n>] [--bounded --sample-size <n> --seed <string>] [--estimate | --dry-run] " +
            "[--out <file>] [--resume <file>] [--progress] [--format json]",
    },
    {
        command: "outcomelibrary",
        kind: "invalid",
        label: "generate --format only supports json",
        args: ["generate", "pkg", "--format", "xml"],
        expectedExitCode: 1,
        expectedError:
            '--format only supports "json". Usage: pokie outcomelibrary generate <packageRoot> [--mode <betModeId>] ' +
            "[--stake <number>] [--config-hash <hash>] [--library-id <id>] [--max-outcome-space-size <n>] " +
            "[--bounded --sample-size <n> --seed <string>] [--estimate | --dry-run] [--out <file>] " +
            "[--resume <file>] [--progress] [--format json]",
    },
    {
        command: "outcomelibrary",
        kind: "invalid",
        label: "generate --bounded requires --sample-size and --seed together",
        args: ["generate", "pkg", "--bounded", "--sample-size", "1000"],
        expectedExitCode: 1,
        expectedError:
            "--bounded requires both --sample-size and --seed. Usage: pokie outcomelibrary generate <packageRoot> " +
            "[--mode <betModeId>] [--stake <number>] [--config-hash <hash>] [--library-id <id>] " +
            "[--max-outcome-space-size <n>] [--bounded --sample-size <n> --seed <string>] [--estimate | --dry-run] " +
            "[--out <file>] [--resume <file>] [--progress] [--format json]",
    },
    {
        command: "outcomelibrary",
        kind: "invalid",
        label: "generate --sample-size/--seed given without --bounded",
        args: ["generate", "pkg", "--sample-size", "1000", "--seed", "abc"],
        expectedExitCode: 1,
        expectedError:
            "--sample-size and --seed require --bounded. Usage: pokie outcomelibrary generate <packageRoot> " +
            "[--mode <betModeId>] [--stake <number>] [--config-hash <hash>] [--library-id <id>] " +
            "[--max-outcome-space-size <n>] [--bounded --sample-size <n> --seed <string>] [--estimate | --dry-run] " +
            "[--out <file>] [--resume <file>] [--progress] [--format json]",
    },
    {
        command: "outcomelibrary",
        kind: "invalid",
        label: "generate --mode given with no value",
        args: ["generate", "pkg", "--mode"],
        expectedExitCode: 1,
        expectedError:
            "--mode requires a bet mode id. Usage: pokie outcomelibrary generate <packageRoot> [--mode <betModeId>] " +
            "[--stake <number>] [--config-hash <hash>] [--library-id <id>] [--max-outcome-space-size <n>] " +
            "[--bounded --sample-size <n> --seed <string>] [--estimate | --dry-run] [--out <file>] " +
            "[--resume <file>] [--progress] [--format json]",
    },
    {
        command: "outcomelibrary",
        kind: "invalid",
        label: "generate --stake given with no value",
        args: ["generate", "pkg", "--stake"],
        expectedExitCode: 1,
        expectedError:
            "--stake must be a positive number. Usage: pokie outcomelibrary generate <packageRoot> [--mode <betModeId>] " +
            "[--stake <number>] [--config-hash <hash>] [--library-id <id>] [--max-outcome-space-size <n>] " +
            "[--bounded --sample-size <n> --seed <string>] [--estimate | --dry-run] [--out <file>] " +
            "[--resume <file>] [--progress] [--format json]",
    },
    {
        command: "outcomelibrary",
        kind: "invalid",
        label: "generate --config-hash given with no value",
        args: ["generate", "pkg", "--config-hash"],
        expectedExitCode: 1,
        expectedError:
            "--config-hash requires a value. Usage: pokie outcomelibrary generate <packageRoot> [--mode <betModeId>] " +
            "[--stake <number>] [--config-hash <hash>] [--library-id <id>] [--max-outcome-space-size <n>] " +
            "[--bounded --sample-size <n> --seed <string>] [--estimate | --dry-run] [--out <file>] " +
            "[--resume <file>] [--progress] [--format json]",
    },
    {
        command: "outcomelibrary",
        kind: "invalid",
        label: "generate --library-id given with no value",
        args: ["generate", "pkg", "--library-id"],
        expectedExitCode: 1,
        expectedError:
            "--library-id requires a value. Usage: pokie outcomelibrary generate <packageRoot> [--mode <betModeId>] " +
            "[--stake <number>] [--config-hash <hash>] [--library-id <id>] [--max-outcome-space-size <n>] " +
            "[--bounded --sample-size <n> --seed <string>] [--estimate | --dry-run] [--out <file>] " +
            "[--resume <file>] [--progress] [--format json]",
    },
    {
        command: "outcomelibrary",
        kind: "invalid",
        label: "generate --max-outcome-space-size given with no value",
        args: ["generate", "pkg", "--max-outcome-space-size"],
        expectedExitCode: 1,
        expectedError:
            "--max-outcome-space-size must be a positive integer. Usage: pokie outcomelibrary generate <packageRoot> " +
            "[--mode <betModeId>] [--stake <number>] [--config-hash <hash>] [--library-id <id>] " +
            "[--max-outcome-space-size <n>] [--bounded --sample-size <n> --seed <string>] [--estimate | --dry-run] " +
            "[--out <file>] [--resume <file>] [--progress] [--format json]",
    },
    {
        command: "outcomelibrary",
        kind: "invalid",
        label: "generate --sample-size given with no value",
        args: ["generate", "pkg", "--sample-size"],
        expectedExitCode: 1,
        expectedError:
            "--sample-size must be a positive integer. Usage: pokie outcomelibrary generate <packageRoot> " +
            "[--mode <betModeId>] [--stake <number>] [--config-hash <hash>] [--library-id <id>] " +
            "[--max-outcome-space-size <n>] [--bounded --sample-size <n> --seed <string>] [--estimate | --dry-run] " +
            "[--out <file>] [--resume <file>] [--progress] [--format json]",
    },
    {
        command: "outcomelibrary",
        kind: "invalid",
        label: "generate --seed given with no value",
        args: ["generate", "pkg", "--seed"],
        expectedExitCode: 1,
        expectedError:
            "--seed requires a value. Usage: pokie outcomelibrary generate <packageRoot> [--mode <betModeId>] " +
            "[--stake <number>] [--config-hash <hash>] [--library-id <id>] [--max-outcome-space-size <n>] " +
            "[--bounded --sample-size <n> --seed <string>] [--estimate | --dry-run] [--out <file>] " +
            "[--resume <file>] [--progress] [--format json]",
    },
    {
        command: "outcomelibrary",
        kind: "invalid",
        label: "generate --out given with no value",
        args: ["generate", "pkg", "--out"],
        expectedExitCode: 1,
        expectedError:
            "--out requires a file path. Usage: pokie outcomelibrary generate <packageRoot> [--mode <betModeId>] " +
            "[--stake <number>] [--config-hash <hash>] [--library-id <id>] [--max-outcome-space-size <n>] " +
            "[--bounded --sample-size <n> --seed <string>] [--estimate | --dry-run] [--out <file>] " +
            "[--resume <file>] [--progress] [--format json]",
    },
    {
        command: "outcomelibrary",
        kind: "invalid",
        label: "generate --resume given with no value",
        args: ["generate", "pkg", "--resume"],
        expectedExitCode: 1,
        expectedError:
            "--resume requires a file path. Usage: pokie outcomelibrary generate <packageRoot> [--mode <betModeId>] " +
            "[--stake <number>] [--config-hash <hash>] [--library-id <id>] [--max-outcome-space-size <n>] " +
            "[--bounded --sample-size <n> --seed <string>] [--estimate | --dry-run] [--out <file>] " +
            "[--resume <file>] [--progress] [--format json]",
    },
    {
        command: "outcomelibrary",
        kind: "invalid",
        label: "generate --format given with no value",
        args: ["generate", "pkg", "--format"],
        expectedExitCode: 1,
        expectedError:
            '--format only supports "json". Usage: pokie outcomelibrary generate <packageRoot> [--mode <betModeId>] ' +
            "[--stake <number>] [--config-hash <hash>] [--library-id <id>] [--max-outcome-space-size <n>] " +
            "[--bounded --sample-size <n> --seed <string>] [--estimate | --dry-run] [--out <file>] " +
            "[--resume <file>] [--progress] [--format json]",
    },
    {
        command: "outcomelibrary",
        kind: "valid",
        label: "generate <packageRoot> (no options — default output/estimate off, human summary)",
        args: ["generate", "pkg"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "outcomelibrary",
        kind: "valid",
        label: "generate <packageRoot> --mode --stake --config-hash --library-id --max-outcome-space-size --out --resume --progress --format json (accepted values, main flow)",
        args: [
            "generate",
            "pkg",
            "--mode",
            "base",
            "--stake",
            "1.5",
            "--config-hash",
            "sha256:abc",
            "--library-id",
            "custom-lib",
            "--max-outcome-space-size",
            "1000000",
            "--out",
            "out.json",
            "--resume",
            "checkpoint.json",
            "--progress",
            "--format",
            "json",
        ],
        expectedExitCode: 0,
        expectStdout: "json",
    },
    {
        command: "outcomelibrary",
        kind: "valid",
        label: "generate <packageRoot> --bounded --sample-size --seed (accepted bounded-coverage options)",
        args: ["generate", "pkg", "--bounded", "--sample-size", "1000", "--seed", "seed-1"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "outcomelibrary",
        kind: "valid",
        label: "generate <packageRoot> --estimate (accepted --estimate flag)",
        args: ["generate", "pkg", "--estimate"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "outcomelibrary",
        kind: "valid",
        label: "generate <packageRoot> --dry-run (accepted --dry-run flag)",
        args: ["generate", "pkg", "--dry-run"],
        expectedExitCode: 0,
        expectStdout: "text",
    },

    // --- par ---
    {
        command: "par",
        kind: "invalid",
        label: "missing/unknown subcommand",
        args: [],
        expectedExitCode: 1,
        expectedError:
            "Usage: pokie par import <input.xlsx> [--out <blueprint.json>] [--format json]\n" +
            "   or: pokie par export <config.json> [--out <output.xlsx>]",
    },
    {
        command: "par",
        kind: "invalid",
        label: "import missing <input.xlsx>",
        args: ["import"],
        expectedExitCode: 1,
        expectedError: "Usage: pokie par import <input.xlsx> [--out <blueprint.json>] [--format json]",
    },
    {
        command: "par",
        kind: "invalid",
        label: "import --format only supports json",
        args: ["import", "input.xlsx", "--format", "xml"],
        expectedExitCode: 1,
        expectedError:
            '--format only supports "json". Usage: pokie par import <input.xlsx> [--out <blueprint.json>] [--format json]',
    },
    {
        command: "par",
        kind: "valid",
        label: "import <input.xlsx> --format json (accepted --format value, machine-readable shape)",
        args: ["import", "input.xlsx", "--format", "json"],
        expectedExitCode: 0,
        expectStdout: "json",
    },
    {
        command: "par",
        kind: "valid",
        label: "import <input.xlsx> --out <file> (accepted --out value, default --format summary)",
        args: ["import", "input.xlsx", "--out", "custom-blueprint-out.json"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "par",
        kind: "invalid",
        label: "export missing <config.json>",
        args: ["export"],
        expectedExitCode: 1,
        expectedError: "Usage: pokie par export <config.json> [--out <output.xlsx>]",
    },
    {
        command: "par",
        kind: "valid",
        label: "export <config.json> (default --out)",
        args: ["export", "config.json"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "par",
        kind: "valid",
        label: "export <config.json> --out <file> (accepted --out value)",
        args: ["export", "config.json", "--out", "custom-output.xlsx"],
        expectedExitCode: 0,
        expectStdout: "text",
    },

    // --- reel ---
    {
        command: "reel",
        kind: "invalid",
        label: "missing/unknown subcommand",
        args: [],
        expectedExitCode: 1,
        expectedError: "Usage: pokie reel generate <blueprint.json> [--reel <index>] [--seed <integer>] [--apply] [--out <file>] [--format json]",
    },
    {
        command: "reel",
        kind: "invalid",
        label: "generate missing <blueprint.json>",
        args: ["generate"],
        expectedExitCode: 1,
        expectedError: "Usage: pokie reel generate <blueprint.json> [--reel <index>] [--seed <integer>] [--apply] [--out <file>] [--format json]",
    },
    {
        command: "reel",
        kind: "invalid",
        label: "generate --reel must be a non-negative integer",
        args: ["generate", "game.json", "--reel", "-1"],
        expectedExitCode: 1,
        expectedError:
            "--reel must be a non-negative integer. Usage: pokie reel generate <blueprint.json> [--reel <index>] [--seed <integer>] [--apply] [--out <file>] [--format json]",
    },
    {
        command: "reel",
        kind: "invalid",
        label: "generate --seed must be an integer",
        args: ["generate", "game.json", "--seed", "notanumber"],
        expectedExitCode: 1,
        expectedError:
            "--seed requires an integer value. Usage: pokie reel generate <blueprint.json> [--reel <index>] [--seed <integer>] [--apply] [--out <file>] [--format json]",
    },
    {
        command: "reel",
        kind: "invalid",
        label: "generate --format only supports json",
        args: ["generate", "game.json", "--format", "xml"],
        expectedExitCode: 1,
        expectedError:
            '--format only supports "json". Usage: pokie reel generate <blueprint.json> [--reel <index>] [--seed <integer>] [--apply] [--out <file>] [--format json]',
    },
    {
        // Placed before every other "reel generate" case so it wins the default (omitted) evidence for
        // --reel/--seed/--apply/--format all at once: the fixture blueprint's reelStripGeneration has reel 1 and
        // reel 2 "generated" (reel 0 is literal), so omitting --reel targets both, in ascending order -- the
        // injected resolveGeneration observes --reel/--seed at each call, last-write-wins, landing on reel 2's own
        // values. --apply's default "false" and --out's default "undefined" both come from writeFile never being
        // called during this dry-run preview (see deferValueUnlessCalled).
        command: "reel",
        kind: "valid",
        label: 'generate <blueprint.json> (no flags at all -- default --reel/--seed/--apply/--out/--format, previews every "generated" reel, writes nothing)',
        args: ["generate", "game.json"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "reel",
        kind: "valid",
        label: "generate <blueprint.json> --reel <index> --seed <integer> --format json (accepted --reel/--seed/--format values, machine-readable shape)",
        args: ["generate", "game.json", "--reel", "1", "--seed", "999", "--format", "json"],
        expectedExitCode: 0,
        expectStdout: "json",
    },
    {
        command: "reel",
        kind: "valid",
        label: "generate <blueprint.json> --apply --out <file> (accepted --apply/--out values)",
        args: ["generate", "game.json", "--apply", "--out", "custom.json"],
        expectedExitCode: 0,
        expectStdout: "text",
    },

    // --- replay ---
    {
        command: "replay",
        kind: "invalid",
        label: "missing <packageRoot>",
        args: [],
        expectedExitCode: 1,
        expectedError:
            "Usage: pokie replay <packageRoot> --round <number> [--seed <string>] [--out <file>] [--format json]\n" +
            "   or: pokie replay <outcomeLibraryPath> --round <number> --seed <string> --mode <modeName> [--out <file>]",
    },
    {
        command: "replay",
        kind: "invalid",
        label: "--round is required",
        args: ["pkg"],
        expectedExitCode: 1,
        expectedError:
            "--round is required. Usage: pokie replay <packageRoot> --round <number> [--seed <string>] [--out <file>] [--format json]\n" +
            "   or: pokie replay <outcomeLibraryPath> --round <number> --seed <string> --mode <modeName> [--out <file>]",
    },
    {
        command: "replay",
        kind: "invalid",
        label: "--round must be a positive integer",
        args: ["pkg", "--round", "0"],
        expectedExitCode: 1,
        expectedError:
            "--round must be a positive integer. Usage: pokie replay <packageRoot> --round <number> [--seed <string>] [--out <file>] [--format json]\n" +
            "   or: pokie replay <outcomeLibraryPath> --round <number> --seed <string> --mode <modeName> [--out <file>]",
    },
    {
        command: "replay",
        kind: "invalid",
        label: "--format only supports json",
        args: ["pkg", "--round", "3", "--format", "xml"],
        expectedExitCode: 1,
        expectedError:
            '--format only supports "json". Usage: pokie replay <packageRoot> --round <number> [--seed <string>] [--out <file>] [--format json]\n' +
            "   or: pokie replay <outcomeLibraryPath> --round <number> --seed <string> --mode <modeName> [--out <file>]",
    },
    {
        command: "replay",
        kind: "valid",
        label: "<packageRoot> --round <number> (accepted --round value, prints the replay JSON)",
        args: ["pkg", "--round", "3"],
        expectedExitCode: 0,
        expectStdout: "json",
    },
    {
        command: "replay",
        kind: "valid",
        label: "<packageRoot> --round --seed --out --format (accepted --seed/--out/--format values)",
        args: ["pkg", "--round", "5", "--seed", "demo-seed", "--out", "replay-out.json", "--format", "json"],
        expectedExitCode: 0,
        expectStdout: "text",
    },

    // --- report ---
    {
        command: "report",
        kind: "invalid",
        label: "missing <simulationReportJson>",
        args: [],
        expectedExitCode: 1,
        expectedError: "Usage: pokie report <simulationReportJson> [--format markdown|html] [--out <file>]",
    },
    {
        command: "report",
        kind: "invalid",
        label: '--format must be "markdown" or "html"',
        args: ["report.json", "--format", "json"],
        expectedExitCode: 1,
        expectedError:
            '--format must be "markdown" or "html". Usage: pokie report <simulationReportJson> [--format markdown|html] [--out <file>]',
    },
    {
        command: "report",
        kind: "valid",
        label: "<simulationReportJson> (default --format markdown)",
        args: ["report.json"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "report",
        kind: "valid",
        label: "<simulationReportJson> --format html --out <file> (accepted --format/--out values)",
        args: ["report.json", "--format", "html", "--out", "report-out.html"],
        expectedExitCode: 0,
        expectStdout: "text",
    },

    // --- serve ---
    {
        command: "serve",
        kind: "invalid",
        label: "missing <packageRoot>",
        args: [],
        expectedExitCode: 1,
        expectedError:
            "Usage: pokie serve <packageRoot> [--port <number>] [--host <string>]\n" +
            "   or: pokie serve <outcomeLibraryPath> --mode <modeName> [--port <number>] [--host <string>]",
    },
    {
        command: "serve",
        kind: "invalid",
        label: "--port must be a non-negative integer",
        args: ["pkg", "--port", "-5"],
        expectedExitCode: 1,
        expectedError:
            "--port must be a non-negative integer. Usage: pokie serve <packageRoot> [--port <number>] [--host <string>]\n" +
            "   or: pokie serve <outcomeLibraryPath> --mode <modeName> [--port <number>] [--host <string>]",
    },
    {
        command: "serve",
        kind: "valid",
        label: "<packageRoot> (default host/port)",
        args: ["pkg"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "serve",
        kind: "valid",
        label: "<packageRoot> --port --host (accepted --port/--host values)",
        args: ["pkg", "--port", "4321", "--host", "0.0.0.0"],
        expectedExitCode: 0,
        expectStdout: "text",
    },

    // --- sim ---
    {
        command: "sim",
        kind: "invalid",
        label: "missing <packageRoot>",
        args: [],
        expectedExitCode: 1,
        expectedError:
            "Usage: pokie sim <packageRoot> [--rounds <number>] [--seed <string>] [--workers <number>] " +
            "[--mode <betModeId>|all] [--out <file>] [--format json] " +
            "[--min-rounds <number> --rtp-tolerance <number> --check-interval <number> [--stable-checks <number>]]",
    },
    {
        command: "sim",
        kind: "invalid",
        label: "--rounds must be a positive integer",
        args: ["pkg", "--rounds", "0"],
        expectedExitCode: 1,
        expectedError:
            "--rounds must be a positive integer. Usage: pokie sim <packageRoot> [--rounds <number>] " +
            "[--seed <string>] [--workers <number>] [--mode <betModeId>|all] [--out <file>] [--format json] " +
            "[--min-rounds <number> --rtp-tolerance <number> --check-interval <number> [--stable-checks <number>]]",
    },
    {
        command: "sim",
        kind: "invalid",
        label: "--workers must be within [1, MAX_SIMULATION_WORKERS]",
        args: ["pkg", "--workers", "0"],
        expectedExitCode: 1,
        expectedError:
            `--workers must be an integer between 1 and ${MAX_SIMULATION_WORKERS}. Usage: pokie sim <packageRoot> [--rounds <number>] ` +
            "[--seed <string>] [--workers <number>] [--mode <betModeId>|all] [--out <file>] [--format json] " +
            "[--min-rounds <number> --rtp-tolerance <number> --check-interval <number> [--stable-checks <number>]]",
    },
    {
        command: "sim",
        kind: "invalid",
        label: "--format only supports json",
        args: ["pkg", "--format", "xml"],
        expectedExitCode: 1,
        expectedError:
            '--format only supports "json". Usage: pokie sim <packageRoot> [--rounds <number>] ' +
            "[--seed <string>] [--workers <number>] [--mode <betModeId>|all] [--out <file>] [--format json] " +
            "[--min-rounds <number> --rtp-tolerance <number> --check-interval <number> [--stable-checks <number>]]",
    },
    {
        command: "sim",
        kind: "invalid",
        label: "convergence flags must all be given together (partial group)",
        args: ["pkg", "--min-rounds", "100"],
        expectedExitCode: 1,
        expectedError:
            "--min-rounds, --rtp-tolerance and --check-interval must all be provided together to enable adaptive convergence. " +
            "Usage: pokie sim <packageRoot> [--rounds <number>] [--seed <string>] [--workers <number>] [--mode <betModeId>|all] " +
            "[--out <file>] [--format json] [--min-rounds <number> --rtp-tolerance <number> --check-interval <number> [--stable-checks <number>]]",
    },
    {
        command: "sim",
        kind: "invalid",
        label: "--stable-checks alone (without the required group) is rejected",
        args: ["pkg", "--stable-checks", "3"],
        expectedExitCode: 1,
        expectedError:
            "--stable-checks requires --min-rounds, --rtp-tolerance and --check-interval to also be set. " +
            "Usage: pokie sim <packageRoot> [--rounds <number>] [--seed <string>] [--workers <number>] [--mode <betModeId>|all] " +
            "[--out <file>] [--format json] [--min-rounds <number> --rtp-tolerance <number> --check-interval <number> [--stable-checks <number>]]",
    },
    {
        command: "sim",
        kind: "valid",
        label: "<packageRoot> --format json (machine-readable shape, default --rounds/--workers)",
        args: ["pkg", "--format", "json"],
        expectedExitCode: 0,
        expectStdout: "json",
    },
    {
        command: "sim",
        kind: "valid",
        label: "<packageRoot> --rounds --seed --workers --mode --out (accepted values, default --format summary)",
        args: ["pkg", "--rounds", "500", "--seed", "demo", "--workers", "2", "--mode", "base", "--out", "sim-out.json"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "sim",
        kind: "valid",
        label: "<packageRoot> --min-rounds --rtp-tolerance --check-interval --stable-checks (accepted convergence group)",
        args: ["pkg", "--min-rounds", "1000", "--rtp-tolerance", "0.5", "--check-interval", "100", "--stable-checks", "2", "--format", "json"],
        expectedExitCode: 0,
        expectStdout: "json",
    },

    // --- stakeengine ---
    {
        command: "stakeengine",
        kind: "invalid",
        label: "missing/unknown subcommand",
        args: [],
        expectedExitCode: 1,
        expectedError:
            "Usage: pokie stakeengine export <config.json> [--out <dir>]\n" +
            "   or: pokie stakeengine import <stakeDir> [--out <dir>]\n" +
            "   or: pokie stakeengine analyze <stakeDir> [--format json] [--out <file>]\n" +
            "   or: pokie stakeengine diff <leftStakeDir> <rightStakeDir> [--format json] [--out <file>]\n" +
            '<config.json> lists one WeightedOutcomeLibrary source per Stake mode, either a plain JSON file — ' +
            '{"modes": [{"modeName": "base", "cost": 1, "libraryPath": "./libraries/base.json"}, ...]} — or a canonical ' +
            'outcome-library bundle (see docs/outcome-library-bundle.md) — {"modeName": "base", "cost": 1, "bundleDir": ' +
            '"./bundle", "bundleModeName": "base"} ("bundleModeName" defaults to "modeName" when omitted); exactly one ' +
            'of "libraryPath"/"bundleDir" is required per mode — see docs/stake-engine-export.md for the format.',
    },
    {
        command: "stakeengine",
        kind: "invalid",
        label: "export missing <config.json>",
        args: ["export"],
        expectedExitCode: 1,
        expectedError:
            "Usage: pokie stakeengine export <config.json> [--out <dir>]\n" +
            '<config.json> lists one WeightedOutcomeLibrary source per Stake mode, either a plain JSON file — ' +
            '{"modes": [{"modeName": "base", "cost": 1, "libraryPath": "./libraries/base.json"}, ...]} — or a canonical ' +
            'outcome-library bundle (see docs/outcome-library-bundle.md) — {"modeName": "base", "cost": 1, "bundleDir": ' +
            '"./bundle", "bundleModeName": "base"} ("bundleModeName" defaults to "modeName" when omitted); exactly one ' +
            'of "libraryPath"/"bundleDir" is required per mode — see docs/stake-engine-export.md for the format.',
    },
    {
        command: "stakeengine",
        kind: "valid",
        label: "export <config.json> (default --out)",
        args: ["export", "config.json"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "stakeengine",
        kind: "valid",
        label: "export <config.json> --out <dir> (accepted --out value)",
        args: ["export", "config.json", "--out", "custom-stakeengine-out"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "stakeengine",
        kind: "invalid",
        label: "import missing <stakeDir>",
        args: ["import"],
        expectedExitCode: 1,
        expectedError:
            "Usage: pokie stakeengine import <stakeDir> [--out <dir>]\n" +
            '<stakeDir> is a directory previously produced by "pokie stakeengine export" (index.json, per-mode lookup ' +
            "CSV/books, and its own pokie-manifest.json) — see docs/stake-engine-import.md for details.",
    },
    {
        command: "stakeengine",
        kind: "valid",
        label: "import <stakeDir> (default --out)",
        args: ["import", "stakeDir"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "stakeengine",
        kind: "valid",
        label: "import <stakeDir> --out <dir> (accepted --out value)",
        args: ["import", "stakeDir", "--out", "custom-stakeengine-import-out"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "stakeengine",
        kind: "invalid",
        label: "analyze missing <stakeDir>",
        args: ["analyze"],
        expectedExitCode: 1,
        expectedError:
            "Usage: pokie stakeengine analyze <stakeDir> [--format json] [--out <file>]\n" +
            "<stakeDir> is any Stake Engine outcome directory (index.json, per-mode lookup CSV, per-mode zstd-compressed " +
            "JSONL books) — POKIE's own export or a third party's, with or without a pokie-manifest.json — see " +
            "docs/stake-engine-standalone.md for details.",
    },
    {
        command: "stakeengine",
        kind: "valid",
        label: "analyze <stakeDir> --format json (accepted --format value, machine-readable shape)",
        args: ["analyze", "stakeDir", "--format", "json"],
        expectedExitCode: 0,
        expectStdout: "json",
    },
    {
        command: "stakeengine",
        kind: "valid",
        label: "analyze <stakeDir> --out <file> (accepted --out value, default --format summary)",
        args: ["analyze", "stakeDir", "--out", "analyze-out.json"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "stakeengine",
        kind: "invalid",
        label: "diff missing <rightStakeDir>",
        args: ["diff", "left"],
        expectedExitCode: 1,
        expectedError:
            "Usage: pokie stakeengine diff <leftStakeDir> <rightStakeDir> [--format json] [--out <file>]\n" +
            "<leftStakeDir> and <rightStakeDir> are each any Stake Engine outcome directory (index.json, per-mode lookup " +
            "CSV, per-mode zstd-compressed JSONL books) — POKIE's own export or a third party's, with or without a " +
            "pokie-manifest.json — see docs/stake-engine-standalone.md for details.",
    },
    {
        command: "stakeengine",
        kind: "valid",
        label: "diff <leftStakeDir> <rightStakeDir> (no material difference -> the diff(1)-style exit 0)",
        args: ["diff", "left", "right"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "stakeengine",
        kind: "valid",
        label: "diff <leftStakeDir> <rightStakeDir> --format json --out <file> (accepted --format/--out values)",
        args: ["diff", "left", "right", "--format", "json", "--out", "diff-out.json"],
        expectedExitCode: 0,
        expectStdout: "json",
    },
    {
        command: "stakeengine",
        kind: "invalid",
        label: "analyze --format only supports json (validated before the stakeDir is ever read)",
        args: ["analyze", "some-stake-dir", "--format", "xml"],
        expectedExitCode: 1,
        expectedError: '--format only supports "json". Usage: pokie stakeengine analyze <stakeDir> [--format json] [--out <file>]',
    },
    {
        command: "stakeengine",
        kind: "invalid",
        label: "diff --format only supports json (validated before either stakeDir is ever read)",
        args: ["diff", "left-dir", "right-dir", "--format", "xml"],
        expectedExitCode: 1,
        expectedError:
            '--format only supports "json". Usage: pokie stakeengine diff <leftStakeDir> <rightStakeDir> [--format json] [--out <file>]',
    },

    // --- studio ---
    {
        command: "studio",
        kind: "invalid",
        label: "--port must be a non-negative integer (validated before any server/browser is touched)",
        args: ["--port", "notanumber"],
        expectedExitCode: 1,
        expectedError:
            "--port must be a non-negative integer. Usage: pokie studio [projectRoot] [--port <number>] [--host <string>] [--no-open]",
    },
    {
        command: "studio",
        kind: "valid",
        label: "--no-open (home mode: no projectRoot given, skips the accepted-but-unexercised browser-open step)",
        args: ["--no-open"],
        expectedExitCode: 0,
        expectStdout: "text",
    },
    {
        command: "studio",
        kind: "valid",
        label: "--port --host (accepted values, default --no-open triggers the injected openBrowser stub)",
        args: ["--port", "7000", "--host", "0.0.0.0"],
        expectedExitCode: 0,
        expectStdout: "text",
    },

    // --- validate ---
    {
        command: "validate",
        kind: "invalid",
        label: "missing <packageRoot>",
        args: [],
        expectedExitCode: 1,
        expectedError: "Usage: pokie validate <packageRoot> [--format json] [--out <file>]",
    },
    {
        command: "validate",
        kind: "invalid",
        label: "--format only supports json",
        args: ["pkg", "--format", "xml"],
        expectedExitCode: 1,
        expectedError: '--format only supports "json". Usage: pokie validate <packageRoot> [--format json] [--out <file>]',
    },
    {
        command: "validate",
        kind: "valid",
        label: "<packageRoot> --format json (accepted --format value, machine-readable shape)",
        args: ["pkg", "--format", "json"],
        expectedExitCode: 0,
        expectStdout: "json",
    },
    {
        command: "validate",
        kind: "valid",
        label: "<packageRoot> --out <file> (accepted --out value, default --format summary)",
        args: ["pkg", "--out", "validate-out.json"],
        expectedExitCode: 0,
        expectStdout: "text",
    },

    // --- missing-value coverage: every non-boolean option given as the very last argv token, with no
    // value following it at all -- Commander's own "commander.optionMissingArgument" error code (see
    // translateCommanderError in cli/commands/internal/CommanderCliAdapter.ts), a distinct parse failure
    // from both an omitted flag (the option's own documented default, asserted above) and a rejected
    // *value* (e.g. "--port abc", asserted above too) -- Commander throws this before the flag's own
    // value parser/validator ever runs, so a command whose optionMissingArgument handler happens to
    // reuse a validated option's rejected-value wording is exercising that wording via a genuinely
    // different code path, not a duplicate of the rejected-value case above it. ---

    // --- build: missing-value cases ---
    {
        command: "build",
        kind: "invalid",
        label: "--target given with no value",
        args: ["config.json", "--target"],
        expectedExitCode: 1,
        expectedError: "--target requires a directory path. Usage: pokie build <config.json> [--target <dir>] [--dry-run]",
    },
    {
        command: "build",
        kind: "invalid",
        label: "random --seed given with no value",
        args: ["random", "--seed"],
        expectedExitCode: 1,
        expectedError: "--seed requires an integer value. Usage: pokie build random [--seed <integer>] [--target <dir>] [--dry-run] [--preset default|variant]",
    },
    {
        command: "build",
        kind: "invalid",
        label: "random --target given with no value",
        args: ["random", "--target"],
        expectedExitCode: 1,
        expectedError: "--target requires a directory path. Usage: pokie build random [--seed <integer>] [--target <dir>] [--dry-run] [--preset default|variant]",
    },
    {
        command: "build",
        kind: "invalid",
        label: "random --preset given with no value",
        args: ["random", "--preset"],
        expectedExitCode: 1,
        expectedError: "--preset must be one of: default, variant. Usage: pokie build random [--seed <integer>] [--target <dir>] [--dry-run] [--preset default|variant]",
    },

    // --- certification: missing-value cases ---
    {
        command: "certification",
        kind: "invalid",
        label: "build --out given with no value",
        args: ["build", "bundleDir", "config.json", "--out"],
        expectedExitCode: 1,
        expectedError: "--out requires a directory path. Usage: pokie certification build <bundleDir> <config.json> [--out <dir>]",
    },
    {
        command: "certification",
        kind: "invalid",
        label: "verify --source given with no value",
        args: ["verify", "certDir", "--source"],
        expectedExitCode: 1,
        expectedError: "--source requires a directory path. Usage: pokie certification verify <certDir> --source <bundleDir>",
    },

    // --- client: missing-value cases ---
    {
        command: "client",
        kind: "invalid",
        label: "--port given with no value",
        args: ["pkg", "--port"],
        expectedExitCode: 1,
        expectedError: "--port must be a non-negative integer. Usage: pokie client <packageRoot> [--port <number>] [--host <string>] [--api-host <string>] [--api-port <number>]",
    },
    {
        command: "client",
        kind: "invalid",
        label: "--host given with no value",
        args: ["pkg", "--host"],
        expectedExitCode: 1,
        expectedError: "--host requires a value. Usage: pokie client <packageRoot> [--port <number>] [--host <string>] [--api-host <string>] [--api-port <number>]",
    },
    {
        command: "client",
        kind: "invalid",
        label: "--api-host given with no value",
        args: ["pkg", "--api-host"],
        expectedExitCode: 1,
        expectedError: "--api-host requires a value. Usage: pokie client <packageRoot> [--port <number>] [--host <string>] [--api-host <string>] [--api-port <number>]",
    },
    {
        command: "client",
        kind: "invalid",
        label: "--api-port given with no value",
        args: ["pkg", "--api-port"],
        expectedExitCode: 1,
        expectedError: "--api-port must be a non-negative integer. Usage: pokie client <packageRoot> [--port <number>] [--host <string>] [--api-host <string>] [--api-port <number>]",
    },

    // --- create: missing-value cases ---
    {
        command: "create",
        kind: "invalid",
        label: "--out given with no value",
        args: ["--out"],
        expectedExitCode: 1,
        expectedError: "--out requires a file path. Usage: pokie create [name] [--out <file>]",
    },
    {
        command: "create",
        kind: "invalid",
        label: "--blank --out given with no value",
        args: ["--blank", "--out"],
        expectedExitCode: 1,
        expectedError: "--out requires a file path. Usage: pokie create [name] --blank [--out <file>]",
    },
    {
        command: "create",
        kind: "invalid",
        label: "--random --seed given with no value",
        args: ["--random", "--seed"],
        expectedExitCode: 1,
        expectedError:
            "--seed requires an integer value. " +
            "Usage: pokie create [name] --random [--seed <integer>] [--preset default|variant] [--out <file>]",
    },
    {
        command: "create",
        kind: "invalid",
        label: "--random --preset given with no value",
        args: ["--random", "--seed", "1", "--preset"],
        expectedExitCode: 1,
        expectedError:
            "--preset must be one of: default, variant. " +
            "Usage: pokie create [name] --random [--seed <integer>] [--preset default|variant] [--out <file>]",
    },
    {
        command: "create",
        kind: "invalid",
        label: "--random --out given with no value",
        args: ["--random", "--out"],
        expectedExitCode: 1,
        expectedError:
            "--out requires a file path. " +
            "Usage: pokie create [name] --random [--seed <integer>] [--preset default|variant] [--out <file>]",
    },

    // --- dev: missing-value cases ---
    {
        command: "dev",
        kind: "invalid",
        label: "--port given with no value",
        args: ["pkg", "--no-open", "--port"],
        expectedExitCode: 1,
        expectedError: "--port must be a non-negative integer. Usage: pokie dev <packageRoot> [--port <number>] [--host <string>] [--client-port <number>] [--client-host <string>] [--no-open]",
    },
    {
        command: "dev",
        kind: "invalid",
        label: "--host given with no value",
        args: ["pkg", "--no-open", "--host"],
        expectedExitCode: 1,
        expectedError: "--host requires a value. Usage: pokie dev <packageRoot> [--port <number>] [--host <string>] [--client-port <number>] [--client-host <string>] [--no-open]",
    },
    {
        command: "dev",
        kind: "invalid",
        label: "--client-port given with no value",
        args: ["pkg", "--no-open", "--client-port"],
        expectedExitCode: 1,
        expectedError: "--client-port must be a non-negative integer. Usage: pokie dev <packageRoot> [--port <number>] [--host <string>] [--client-port <number>] [--client-host <string>] [--no-open]",
    },
    {
        command: "dev",
        kind: "invalid",
        label: "--client-host given with no value",
        args: ["pkg", "--no-open", "--client-host"],
        expectedExitCode: 1,
        expectedError: "--client-host requires a value. Usage: pokie dev <packageRoot> [--port <number>] [--host <string>] [--client-port <number>] [--client-host <string>] [--no-open]",
    },

    // --- diff: missing-value cases ---
    {
        command: "diff",
        kind: "invalid",
        label: "--format given with no value",
        args: ["left.json", "right.json", "--format"],
        expectedExitCode: 1,
        expectedError: "--format only supports \"json\". Usage: pokie diff <leftReportJson> <rightReportJson> [--format json] [--out <file>]",
    },
    {
        command: "diff",
        kind: "invalid",
        label: "--out given with no value",
        args: ["left.json", "right.json", "--format", "json", "--out"],
        expectedExitCode: 1,
        expectedError: "--out requires a file path. Usage: pokie diff <leftReportJson> <rightReportJson> [--format json] [--out <file>]",
    },

    // --- fairness: missing-value cases ---
    {
        command: "fairness",
        kind: "invalid",
        label: "seed-commit --out given with no value",
        args: ["seed-commit", "serverSeed.txt", "--out"],
        expectedExitCode: 1,
        expectedError: "--out requires a file path. Usage: pokie fairness seed-commit <serverSeed.txt> [--out <file>] [--overwrite]",
    },
    {
        command: "fairness",
        kind: "invalid",
        label: "commit --client-seed given with no value",
        args: ["commit", "serverSeedCommitment.json", "--nonce", "0", "--source", "bundleDir", "--mode", "base", "--out", "commit-out.json", "--client-seed"],
        expectedExitCode: 1,
        expectedError: "--client-seed requires a value. Usage: pokie fairness commit <serverSeedCommitment.json> --client-seed <seed> --nonce <n> --source <bundleDir> --mode <modeName> [--out <file>] [--overwrite]",
    },
    {
        command: "fairness",
        kind: "invalid",
        label: "commit --nonce given with no value",
        args: ["commit", "serverSeedCommitment.json", "--client-seed", "player-seed", "--source", "bundleDir", "--mode", "base", "--out", "commit-out.json", "--nonce"],
        expectedExitCode: 1,
        expectedError: "--nonce must be a canonical non-negative decimal integer (e.g. \"0\", \"42\" — no sign, decimal point, leading zero, or scientific/hex notation, and no larger than Number.MAX_SAFE_INTEGER), got nothing. Usage: pokie fairness commit <serverSeedCommitment.json> --client-seed <seed> --nonce <n> --source <bundleDir> --mode <modeName> [--out <file>] [--overwrite]",
    },
    {
        command: "fairness",
        kind: "invalid",
        label: "commit --source given with no value",
        args: ["commit", "serverSeedCommitment.json", "--client-seed", "player-seed", "--nonce", "0", "--mode", "base", "--out", "commit-out.json", "--source"],
        expectedExitCode: 1,
        expectedError: "--source requires a directory path. Usage: pokie fairness commit <serverSeedCommitment.json> --client-seed <seed> --nonce <n> --source <bundleDir> --mode <modeName> [--out <file>] [--overwrite]",
    },
    {
        command: "fairness",
        kind: "invalid",
        label: "commit --mode given with no value",
        args: ["commit", "serverSeedCommitment.json", "--client-seed", "player-seed", "--nonce", "0", "--source", "bundleDir", "--out", "commit-out.json", "--mode"],
        expectedExitCode: 1,
        expectedError: "--mode requires a mode name. Usage: pokie fairness commit <serverSeedCommitment.json> --client-seed <seed> --nonce <n> --source <bundleDir> --mode <modeName> [--out <file>] [--overwrite]",
    },
    {
        command: "fairness",
        kind: "invalid",
        label: "commit --out given with no value",
        args: ["commit", "serverSeedCommitment.json", "--client-seed", "player-seed", "--nonce", "0", "--source", "bundleDir", "--mode", "base", "--out"],
        expectedExitCode: 1,
        expectedError: "--out requires a file path. Usage: pokie fairness commit <serverSeedCommitment.json> --client-seed <seed> --nonce <n> --source <bundleDir> --mode <modeName> [--out <file>] [--overwrite]",
    },
    {
        command: "fairness",
        kind: "invalid",
        label: "reveal --server-seed given with no value",
        args: ["reveal", "commitment.json", "--source", "bundleDir", "--out", "reveal-out.json", "--server-seed"],
        expectedExitCode: 1,
        expectedError: "--server-seed requires a file path. Usage: pokie fairness reveal <commitment.json> --server-seed <serverSeed.txt> --source <bundleDir> [--out <file>] [--overwrite]",
    },
    {
        command: "fairness",
        kind: "invalid",
        label: "reveal --source given with no value",
        args: ["reveal", "commitment.json", "--server-seed", "serverSeed.txt", "--out", "reveal-out.json", "--source"],
        expectedExitCode: 1,
        expectedError: "--source requires a directory path. Usage: pokie fairness reveal <commitment.json> --server-seed <serverSeed.txt> --source <bundleDir> [--out <file>] [--overwrite]",
    },
    {
        command: "fairness",
        kind: "invalid",
        label: "reveal --out given with no value",
        args: ["reveal", "commitment.json", "--server-seed", "serverSeed.txt", "--source", "bundleDir", "--out"],
        expectedExitCode: 1,
        expectedError: "--out requires a file path. Usage: pokie fairness reveal <commitment.json> --server-seed <serverSeed.txt> --source <bundleDir> [--out <file>] [--overwrite]",
    },
    {
        command: "fairness",
        kind: "invalid",
        label: "verify --commitment given with no value",
        args: ["verify", "proof.json", "--source", "bundleDir", "--commitment"],
        expectedExitCode: 1,
        expectedError: "--commitment requires a file path. Usage: pokie fairness verify <proof.json> --commitment <commitment.json> --source <bundleDir>",
    },
    {
        command: "fairness",
        kind: "invalid",
        label: "verify --source given with no value",
        args: ["verify", "proof.json", "--commitment", "commitment.json", "--source"],
        expectedExitCode: 1,
        expectedError: "--source requires a directory path. Usage: pokie fairness verify <proof.json> --commitment <commitment.json> --source <bundleDir>",
    },

    // --- name: missing-value cases ---
    {
        command: "name",
        kind: "invalid",
        label: "--count given with no value",
        args: ["--count"],
        expectedExitCode: 1,
        expectedError: "--count requires a positive integer. Usage: pokie name [--count <n>] [--theme <theme>] [--words <2|3>] [--seed <integer>] [--json]",
    },
    {
        command: "name",
        kind: "invalid",
        label: "--theme given with no value",
        args: ["--theme"],
        expectedExitCode: 1,
        expectedError: "--theme must be one of: adventure, mystic, fortune, mythic, cosmic, wild. Usage: pokie name [--count <n>] [--theme <theme>] [--words <2|3>] [--seed <integer>] [--json]",
    },
    {
        command: "name",
        kind: "invalid",
        label: "--words given with no value",
        args: ["--words"],
        expectedExitCode: 1,
        expectedError: "--words must be 2 or 3. Usage: pokie name [--count <n>] [--theme <theme>] [--words <2|3>] [--seed <integer>] [--json]",
    },
    {
        command: "name",
        kind: "invalid",
        label: "--seed given with no value",
        args: ["--seed"],
        expectedExitCode: 1,
        expectedError: "--seed requires an integer value. Usage: pokie name [--count <n>] [--theme <theme>] [--words <2|3>] [--seed <integer>] [--json]",
    },

    // --- outcomelibrary: missing-value cases ---
    {
        command: "outcomelibrary",
        kind: "invalid",
        label: "build --out given with no value",
        args: ["build", "config.json", "--out"],
        expectedExitCode: 1,
        expectedError: "--out requires a directory path. Usage: pokie outcomelibrary build <config.json> [--out <dir>]",
    },

    // --- par: missing-value cases ---
    {
        command: "par",
        kind: "invalid",
        label: "import --out given with no value",
        args: ["import", "input.xlsx", "--format", "json", "--out"],
        expectedExitCode: 1,
        expectedError: "--out requires a file path. Usage: pokie par import <input.xlsx> [--out <blueprint.json>] [--format json]",
    },
    {
        command: "par",
        kind: "invalid",
        label: "import --format given with no value",
        args: ["import", "input.xlsx", "--format"],
        expectedExitCode: 1,
        expectedError: "--format only supports \"json\". Usage: pokie par import <input.xlsx> [--out <blueprint.json>] [--format json]",
    },
    {
        command: "par",
        kind: "invalid",
        label: "export --out given with no value",
        args: ["export", "config.json", "--out"],
        expectedExitCode: 1,
        expectedError: "--out requires a file path. Usage: pokie par export <config.json> [--out <output.xlsx>]",
    },

    // --- reel: missing-value cases ---
    {
        command: "reel",
        kind: "invalid",
        label: "generate --reel given with no value",
        args: ["generate", "game.json", "--reel"],
        expectedExitCode: 1,
        expectedError:
            "--reel must be a non-negative integer. Usage: pokie reel generate <blueprint.json> [--reel <index>] [--seed <integer>] [--apply] [--out <file>] [--format json]",
    },
    {
        command: "reel",
        kind: "invalid",
        label: "generate --seed given with no value",
        args: ["generate", "game.json", "--seed"],
        expectedExitCode: 1,
        expectedError:
            "--seed requires an integer value. Usage: pokie reel generate <blueprint.json> [--reel <index>] [--seed <integer>] [--apply] [--out <file>] [--format json]",
    },
    {
        command: "reel",
        kind: "invalid",
        label: "generate --out given with no value",
        args: ["generate", "game.json", "--apply", "--out"],
        expectedExitCode: 1,
        expectedError:
            "--out requires a file path. Usage: pokie reel generate <blueprint.json> [--reel <index>] [--seed <integer>] [--apply] [--out <file>] [--format json]",
    },
    {
        command: "reel",
        kind: "invalid",
        label: "generate --format given with no value",
        args: ["generate", "game.json", "--format"],
        expectedExitCode: 1,
        expectedError:
            "--format only supports \"json\". Usage: pokie reel generate <blueprint.json> [--reel <index>] [--seed <integer>] [--apply] [--out <file>] [--format json]",
    },

    // --- replay: missing-value cases ---
    {
        command: "replay",
        kind: "invalid",
        label: "--round given with no value",
        args: ["pkg", "--round"],
        expectedExitCode: 1,
        expectedError:
            "--round must be a positive integer. Usage: pokie replay <packageRoot> --round <number> [--seed <string>] [--out <file>] [--format json]\n" +
            "   or: pokie replay <outcomeLibraryPath> --round <number> --seed <string> --mode <modeName> [--out <file>]",
    },
    {
        command: "replay",
        kind: "invalid",
        label: "--seed given with no value",
        args: ["pkg", "--round", "3", "--seed"],
        expectedExitCode: 1,
        expectedError:
            "--seed requires a value. Usage: pokie replay <packageRoot> --round <number> [--seed <string>] [--out <file>] [--format json]\n" +
            "   or: pokie replay <outcomeLibraryPath> --round <number> --seed <string> --mode <modeName> [--out <file>]",
    },
    {
        command: "replay",
        kind: "invalid",
        label: "--out given with no value",
        args: ["pkg", "--round", "3", "--out"],
        expectedExitCode: 1,
        expectedError:
            "--out requires a file path. Usage: pokie replay <packageRoot> --round <number> [--seed <string>] [--out <file>] [--format json]\n" +
            "   or: pokie replay <outcomeLibraryPath> --round <number> --seed <string> --mode <modeName> [--out <file>]",
    },
    {
        command: "replay",
        kind: "invalid",
        label: "--format given with no value",
        args: ["pkg", "--round", "3", "--format"],
        expectedExitCode: 1,
        expectedError:
            "--format only supports \"json\". Usage: pokie replay <packageRoot> --round <number> [--seed <string>] [--out <file>] [--format json]\n" +
            "   or: pokie replay <outcomeLibraryPath> --round <number> --seed <string> --mode <modeName> [--out <file>]",
    },

    // --- report: missing-value cases ---
    {
        command: "report",
        kind: "invalid",
        label: "--format given with no value",
        args: ["report.json", "--format"],
        expectedExitCode: 1,
        expectedError: "--format must be \"markdown\" or \"html\". Usage: pokie report <simulationReportJson> [--format markdown|html] [--out <file>]",
    },
    {
        command: "report",
        kind: "invalid",
        label: "--out given with no value",
        args: ["report.json", "--out"],
        expectedExitCode: 1,
        expectedError: "--out requires a file path. Usage: pokie report <simulationReportJson> [--format markdown|html] [--out <file>]",
    },

    // --- serve: missing-value cases ---
    {
        command: "serve",
        kind: "invalid",
        label: "--port given with no value",
        args: ["pkg", "--port"],
        expectedExitCode: 1,
        expectedError:
            "--port must be a non-negative integer. Usage: pokie serve <packageRoot> [--port <number>] [--host <string>]\n" +
            "   or: pokie serve <outcomeLibraryPath> --mode <modeName> [--port <number>] [--host <string>]",
    },
    {
        command: "serve",
        kind: "invalid",
        label: "--host given with no value",
        args: ["pkg", "--host"],
        expectedExitCode: 1,
        expectedError:
            "--host requires a value. Usage: pokie serve <packageRoot> [--port <number>] [--host <string>]\n" +
            "   or: pokie serve <outcomeLibraryPath> --mode <modeName> [--port <number>] [--host <string>]",
    },

    // --- sim: missing-value cases ---
    {
        command: "sim",
        kind: "invalid",
        label: "--rounds given with no value",
        args: ["pkg", "--format", "json", "--rounds"],
        expectedExitCode: 1,
        expectedError: "--rounds must be a positive integer. Usage: pokie sim <packageRoot> [--rounds <number>] [--seed <string>] [--workers <number>] [--mode <betModeId>|all] [--out <file>] [--format json] [--min-rounds <number> --rtp-tolerance <number> --check-interval <number> [--stable-checks <number>]]",
    },
    {
        command: "sim",
        kind: "invalid",
        label: "--seed given with no value",
        args: ["pkg", "--format", "json", "--seed"],
        expectedExitCode: 1,
        expectedError: "--seed requires a value. Usage: pokie sim <packageRoot> [--rounds <number>] [--seed <string>] [--workers <number>] [--mode <betModeId>|all] [--out <file>] [--format json] [--min-rounds <number> --rtp-tolerance <number> --check-interval <number> [--stable-checks <number>]]",
    },
    {
        command: "sim",
        kind: "invalid",
        label: "--workers given with no value",
        args: ["pkg", "--format", "json", "--workers"],
        expectedExitCode: 1,
        expectedError: "--workers must be an integer between 1 and 32. Usage: pokie sim <packageRoot> [--rounds <number>] [--seed <string>] [--workers <number>] [--mode <betModeId>|all] [--out <file>] [--format json] [--min-rounds <number> --rtp-tolerance <number> --check-interval <number> [--stable-checks <number>]]",
    },
    {
        command: "sim",
        kind: "invalid",
        label: "--mode given with no value",
        args: ["pkg", "--format", "json", "--mode"],
        expectedExitCode: 1,
        expectedError: "--mode requires a bet mode id. Usage: pokie sim <packageRoot> [--rounds <number>] [--seed <string>] [--workers <number>] [--mode <betModeId>|all] [--out <file>] [--format json] [--min-rounds <number> --rtp-tolerance <number> --check-interval <number> [--stable-checks <number>]]",
    },
    {
        command: "sim",
        kind: "invalid",
        label: "--out given with no value",
        args: ["pkg", "--format", "json", "--out"],
        expectedExitCode: 1,
        expectedError: "--out requires a file path. Usage: pokie sim <packageRoot> [--rounds <number>] [--seed <string>] [--workers <number>] [--mode <betModeId>|all] [--out <file>] [--format json] [--min-rounds <number> --rtp-tolerance <number> --check-interval <number> [--stable-checks <number>]]",
    },
    {
        command: "sim",
        kind: "invalid",
        label: "--format given with no value",
        args: ["pkg", "--format"],
        expectedExitCode: 1,
        expectedError: "--format only supports \"json\". Usage: pokie sim <packageRoot> [--rounds <number>] [--seed <string>] [--workers <number>] [--mode <betModeId>|all] [--out <file>] [--format json] [--min-rounds <number> --rtp-tolerance <number> --check-interval <number> [--stable-checks <number>]]",
    },
    {
        command: "sim",
        kind: "invalid",
        label: "--min-rounds given with no value",
        args: ["pkg", "--format", "json", "--min-rounds"],
        expectedExitCode: 1,
        expectedError: "--min-rounds must be a non-negative integer. Usage: pokie sim <packageRoot> [--rounds <number>] [--seed <string>] [--workers <number>] [--mode <betModeId>|all] [--out <file>] [--format json] [--min-rounds <number> --rtp-tolerance <number> --check-interval <number> [--stable-checks <number>]]",
    },
    {
        command: "sim",
        kind: "invalid",
        label: "--rtp-tolerance given with no value",
        args: ["pkg", "--format", "json", "--rtp-tolerance"],
        expectedExitCode: 1,
        expectedError: "--rtp-tolerance must be a positive number. Usage: pokie sim <packageRoot> [--rounds <number>] [--seed <string>] [--workers <number>] [--mode <betModeId>|all] [--out <file>] [--format json] [--min-rounds <number> --rtp-tolerance <number> --check-interval <number> [--stable-checks <number>]]",
    },
    {
        command: "sim",
        kind: "invalid",
        label: "--check-interval given with no value",
        args: ["pkg", "--format", "json", "--check-interval"],
        expectedExitCode: 1,
        expectedError: "--check-interval must be a positive integer. Usage: pokie sim <packageRoot> [--rounds <number>] [--seed <string>] [--workers <number>] [--mode <betModeId>|all] [--out <file>] [--format json] [--min-rounds <number> --rtp-tolerance <number> --check-interval <number> [--stable-checks <number>]]",
    },
    {
        command: "sim",
        kind: "invalid",
        label: "--stable-checks given with no value",
        args: ["pkg", "--format", "json", "--stable-checks"],
        expectedExitCode: 1,
        expectedError: "--stable-checks must be a positive integer. Usage: pokie sim <packageRoot> [--rounds <number>] [--seed <string>] [--workers <number>] [--mode <betModeId>|all] [--out <file>] [--format json] [--min-rounds <number> --rtp-tolerance <number> --check-interval <number> [--stable-checks <number>]]",
    },

    // --- stakeengine: missing-value cases ---
    {
        command: "stakeengine",
        kind: "invalid",
        label: "export --out given with no value",
        args: ["export", "config.json", "--out"],
        expectedExitCode: 1,
        expectedError: "--out requires a directory path. Usage: pokie stakeengine export <config.json> [--out <dir>]",
    },
    {
        command: "stakeengine",
        kind: "invalid",
        label: "import --out given with no value",
        args: ["import", "stakeDir", "--out"],
        expectedExitCode: 1,
        expectedError: "--out requires a directory path. Usage: pokie stakeengine import <stakeDir> [--out <dir>]",
    },
    {
        command: "stakeengine",
        kind: "invalid",
        label: "analyze --format given with no value",
        args: ["analyze", "stakeDir", "--format"],
        expectedExitCode: 1,
        expectedError: "--format only supports \"json\". Usage: pokie stakeengine analyze <stakeDir> [--format json] [--out <file>]",
    },
    {
        command: "stakeengine",
        kind: "invalid",
        label: "analyze --out given with no value",
        args: ["analyze", "stakeDir", "--format", "json", "--out"],
        expectedExitCode: 1,
        expectedError: "--out requires a file path. Usage: pokie stakeengine analyze <stakeDir> [--format json] [--out <file>]",
    },
    {
        command: "stakeengine",
        kind: "invalid",
        label: "diff --format given with no value",
        args: ["diff", "left", "right", "--format"],
        expectedExitCode: 1,
        expectedError: "--format only supports \"json\". Usage: pokie stakeengine diff <leftStakeDir> <rightStakeDir> [--format json] [--out <file>]",
    },
    {
        command: "stakeengine",
        kind: "invalid",
        label: "diff --out given with no value",
        args: ["diff", "left", "right", "--out"],
        expectedExitCode: 1,
        expectedError: "--out requires a file path. Usage: pokie stakeengine diff <leftStakeDir> <rightStakeDir> [--format json] [--out <file>]",
    },

    // --- studio: missing-value cases ---
    {
        command: "studio",
        kind: "invalid",
        label: "--port given with no value",
        args: ["--no-open", "--port"],
        expectedExitCode: 1,
        expectedError: "--port must be a non-negative integer. Usage: pokie studio [projectRoot] [--port <number>] [--host <string>] [--no-open]",
    },
    {
        command: "studio",
        kind: "invalid",
        label: "--host given with no value",
        args: ["--no-open", "--host"],
        expectedExitCode: 1,
        expectedError: "--host requires a value. Usage: pokie studio [projectRoot] [--port <number>] [--host <string>] [--no-open]",
    },

    // --- validate: missing-value cases ---
    {
        command: "validate",
        kind: "invalid",
        label: "--format given with no value",
        args: ["pkg", "--format"],
        expectedExitCode: 1,
        expectedError: "--format only supports \"json\". Usage: pokie validate <packageRoot> [--format json] [--out <file>]",
    },
    {
        command: "validate",
        kind: "invalid",
        label: "--out given with no value",
        args: ["pkg", "--format", "json", "--out"],
        expectedExitCode: 1,
        expectedError: "--out requires a file path. Usage: pokie validate <packageRoot> [--format json] [--out <file>]",
    },
];


export type CliTopLevelDispatchCase = {
    label: string;
    // Full argv tail dispatch() sees, i.e. `process.argv.slice(2)`.
    argv: string[];
    expectedExitCode: number;
    // true: stdout is exactly buildUsageText(commands) and stderr is untouched (the --help/-h/
    // unknown-command shape). false: stderr carries expectedStderr and stdout is untouched instead.
    expectedStdoutIsUsage: boolean;
    expectedStderr?: string;
};

// The dispatcher-level contract that isn't any one command's own: --help/-h (success, the same
// command list an unknown command also gets, but exit 0) and an unrecognized command name that also
// isn't an existing path (exit 1). "--version" freezes what happens today, not a deliberate feature —
// see its own comment below.
export const CLI_TOP_LEVEL_DISPATCH_CASES: CliTopLevelDispatchCase[] = [
    {label: "--help", argv: ["--help"], expectedExitCode: 0, expectedStdoutIsUsage: true},
    {label: "-h", argv: ["-h"], expectedExitCode: 0, expectedStdoutIsUsage: true},
    {
        label: "an unknown command name that is also not an existing path",
        argv: ["totally-bogus-pokie-command-xyz-12345"],
        expectedExitCode: 1,
        expectedStdoutIsUsage: true,
    },
    {
        // No top-level "--version" flag exists today: isTopLevelHelpRequest (resolveCliInvocation.ts)
        // only recognizes --help/-h, so "--version" instead falls through resolveCliInvocation's own
        // step 3 (an unrecognized "-"-prefixed token) and is handed to StudioCommand as argv, which
        // rejects it as an unknown option. Frozen here as today's actual, real behavior — a fallthrough,
        // not a designed feature — so that a future top-level --version implementation is a visible,
        // deliberate diff against this case instead of a silent behavior change.
        label: "--version (no top-level flag exists yet; falls through to Studio's own unknown-option error)",
        argv: ["--version"],
        expectedExitCode: 1,
        expectedStdoutIsUsage: false,
        expectedStderr: 'Unknown option "--version". Usage: pokie studio [projectRoot] [--port <number>] [--host <string>] [--no-open]',
    },
];
