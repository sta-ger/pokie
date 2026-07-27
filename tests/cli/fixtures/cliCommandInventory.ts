// A machine-readable inventory of every public v1.3 `pokie` CLI command (see cli/pokie.ts's own
// `commands` array, which this list's order and names mirror exactly) plus a frozen set of
// side-effect-free "contract cases" — argv that must fail validation before touching the
// filesystem/network — with the exact error message each one throws today.
//
// This exists so a future rewrite of argument parsing (e.g. unifying the 19 hand-rolled
// parseArgs()/switch-based parsers in cli/commands/*.ts behind one shared parser) has something
// concrete to diff against: cliCommandInventory.contract.test.ts replays every case below against
// the real command classes and asserts the message is unchanged. A deliberate wording/behavior
// change updates this file in the same commit; an accidental one fails the test.
//
// Deliberately excludes any case that would touch the filesystem, bind a port, or spawn a
// subprocess — see this repo's "never spawn a CLI command as a subprocess in tests" convention
// (tests/packaging/npmPackSmoke.test.ts is the one sanctioned exception, for packaging itself, not
// per-command behavior). Every command's own parseArgs() validates positionals/options before any
// I/O, so a missing-positional or bad-flag-value case is always reachable without one.

export type CliVerbDescriptor = {
    // The subcommand literal (e.g. "import", "seed-commit"); undefined for a command with no
    // subcommands, or for the bare "unknown subcommand" dispatch case of one that does.
    verb: string | undefined;
    usage: string;
    positionals: string[];
    options: string[];
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
            "interactively via a wizard when run with no config path, or write an editable starter blueprint via " +
            '--init-blueprint <file>. "random"/--random generates a first-class random game instead (--seed to ' +
            "reproduce it, --preset default|variant to pick the generation strategy). --dry-run validates and " +
            "previews without writing anything.",
        verbs: [
            {
                verb: undefined,
                usage: "Usage: pokie build <config.json> [--out <dir>] [--dry-run]",
                positionals: ["config.json"],
                options: ["--out <dir>", "--dry-run"],
            },
            {
                verb: "--init-blueprint",
                usage: "Usage: pokie build --init-blueprint <file>",
                positionals: ["file"],
                options: [],
            },
            {
                verb: "random",
                usage: "Usage: pokie build random [--seed <integer>] [--out <dir>] [--dry-run] [--preset default|variant]",
                positionals: [],
                options: ["--seed <integer>", "--out <dir>", "--dry-run", "--preset default|variant"],
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
                options: ["--out <dir>"],
            },
            {
                verb: "verify",
                usage: "Usage: pokie certification verify <certDir> --source <bundleDir>",
                positionals: ["certDir"],
                options: ["--source <bundleDir> (required)"],
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
                options: ["--port <number>", "--host <string>", "--api-host <string>", "--api-port <number>"],
            },
        ],
    },
    {
        name: "create",
        description:
            "Create a new POKIE-compatible game package in a new directory, or a random-but-valid " +
            "one (reels, symbols, paytable already filled in) via --random (--seed to reproduce it, " +
            "--preset default|variant to pick the generation strategy).",
        verbs: [
            {verb: undefined, usage: "Usage: pokie create <name>", positionals: ["name"], options: []},
            {
                verb: "--random",
                usage: "Usage: pokie create [name] --random [--seed <integer>] [--preset default|variant]",
                positionals: ["name (optional)"],
                options: ["--seed <integer>", "--preset default|variant"],
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
                options: ["--port <number>", "--host <string>", "--client-port <number>", "--client-host <string>", "--no-open"],
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
                options: ["--format json", "--out <file>"],
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
                options: ["--out <file>", "--overwrite"],
            },
            {
                verb: "commit",
                usage:
                    "Usage: pokie fairness commit <serverSeedCommitment.json> --client-seed <seed> --nonce <n> --source <bundleDir> " +
                    "--mode <modeName> [--out <file>] [--overwrite]",
                positionals: ["serverSeedCommitment.json"],
                options: [
                    "--client-seed <seed> (required)",
                    "--nonce <n> (required, canonical non-negative integer)",
                    "--source <bundleDir> (required)",
                    "--mode <modeName> (required)",
                    "--out <file>",
                    "--overwrite",
                ],
            },
            {
                verb: "reveal",
                usage:
                    "Usage: pokie fairness reveal <commitment.json> --server-seed <serverSeed.txt> --source <bundleDir> [--out <file>] [--overwrite]",
                positionals: ["commitment.json"],
                options: ["--server-seed <file> (required)", "--source <bundleDir> (required)", "--out <file>", "--overwrite"],
            },
            {
                verb: "verify",
                usage: "Usage: pokie fairness verify <proof.json> --commitment <commitment.json> --source <bundleDir>",
                positionals: ["proof.json"],
                options: ["--commitment <commitment.json> (required)", "--source <bundleDir> (required)"],
            },
        ],
    },
    {
        name: "init",
        description: "Turn the current npm project into a minimal POKIE-compatible game package.",
        // Takes no CLI arguments at all (scaffolds process.cwd() unconditionally) — no usage/options
        // surface to freeze, and no contract case: running it for real would write into this repo's
        // own working directory.
        verbs: [],
    },
    {
        name: "inspect",
        description:
            'Print a package\'s provenance (game, blueprint hash, source, "pokie build" version) from package.json and src/generated/build-info.json, without running it.',
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
                options: ["--count <n>", "--theme <theme>", "--words <2|3>", "--seed <integer>", "--json"],
            },
        ],
    },
    {
        name: "outcomelibrary",
        description:
            "Build a canonical POKIE outcome-library persistence bundle from WeightedOutcomeLibrary JSON files, or validate one " +
            '("pokie outcomelibrary build <config.json>" / "pokie outcomelibrary validate <bundleDir>").',
        verbs: [
            {
                verb: "build",
                usage: "Usage: pokie outcomelibrary build <config.json> [--out <dir>]",
                positionals: ["config.json"],
                options: ["--out <dir>"],
            },
            {
                verb: "validate",
                usage: "Usage: pokie outcomelibrary validate <bundleDir> [--deep]",
                positionals: ["bundleDir"],
                options: ["--deep"],
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
                options: ["--out <blueprint.json>", "--format json"],
            },
            {
                verb: "export",
                usage: "Usage: pokie par export <config.json> [--out <output.xlsx>]",
                positionals: ["config.json"],
                options: ["--out <output.xlsx>"],
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
                options: ["--round <number> (required)", "--seed <string>", "--out <file>", "--format json"],
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
                options: ["--format markdown|html", "--out <file>"],
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
                options: ["--port <number>", "--host <string>"],
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
                    "--rounds <number>",
                    "--seed <string>",
                    "--workers <number>",
                    "--mode <betModeId>|all",
                    "--out <file>",
                    "--format json",
                    "--min-rounds/--rtp-tolerance/--check-interval (all-or-nothing group)",
                    "--stable-checks <number> (requires the group above)",
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
                options: ["--out <dir>"],
            },
            {
                verb: "import",
                usage: "Usage: pokie stakeengine import <stakeDir> [--out <dir>]",
                positionals: ["stakeDir"],
                options: ["--out <dir>"],
            },
            {
                verb: "analyze",
                usage: "Usage: pokie stakeengine analyze <stakeDir> [--format json] [--out <file>]",
                positionals: ["stakeDir"],
                options: ["--format json", "--out <file>"],
            },
            {
                // Exit codes are the diff(1) convention (0 identical, 1 differs, 2 trouble) — the one
                // pokie CLI subcommand that deliberately doesn't use plain 0-success/1-error.
                verb: "diff",
                usage: "Usage: pokie stakeengine diff <leftStakeDir> <rightStakeDir> [--format json] [--out <file>]",
                positionals: ["leftStakeDir", "rightStakeDir"],
                options: ["--format json", "--out <file>"],
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
                options: ["--port <number>", "--host <string>", "--no-open"],
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
                options: ["--format json", "--out <file>"],
            },
        ],
    },
];
