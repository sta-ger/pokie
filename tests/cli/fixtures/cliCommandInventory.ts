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

import {ALL_SLOT_GAME_NAME_THEMES, MAX_SIMULATION_WORKERS} from "pokie";

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
export const CLI_CONTRACT_CASES: CliContractCase[] = [
    // --- build ---
    {
        command: "build",
        kind: "invalid",
        label: "missing <config.json> (an empty-string positional, since a truly empty argv launches the wizard instead)",
        args: [""],
        expectedExitCode: 1,
        expectedError:
            "Usage: pokie build <config.json> [--out <dir>] [--dry-run]\n" +
            "<config.json> is a GameBlueprint (manifest, reels, rows, symbols, paytable, ...) — see docs/cli.md#pokie-build-configjson for the format.",
    },
    {
        command: "build",
        kind: "valid",
        label: "<config.json> --dry-run validates and previews without writing anything (default, no --out)",
        args: ["config.json", "--dry-run"],
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
            "--seed requires an integer value. Usage: pokie build random [--seed <integer>] [--out <dir>] [--dry-run] [--preset default|variant]",
    },
    {
        command: "build",
        kind: "valid",
        label: "random --seed <integer> --preset variant --dry-run (accepted --preset value)",
        args: ["random", "--seed", "4242", "--preset", "variant", "--dry-run"],
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
        kind: "valid",
        label: "<packageRoot> (default host/port)",
        args: ["pkg"],
        expectedExitCode: 0,
        expectStdout: "text",
    },

    // --- create ---
    {
        command: "create",
        kind: "invalid",
        label: "missing <name>",
        args: [],
        expectedExitCode: 1,
        expectedError: "Usage: pokie create <name>",
    },
    {
        command: "create",
        kind: "valid",
        label: "<name>",
        args: ["sample-slot"],
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
            "--preset must be one of: default, variant. Usage: pokie create [name] --random [--seed <integer>] [--preset default|variant]",
    },
    {
        command: "create",
        kind: "valid",
        label: "--random --seed <integer> (accepted --seed value, default --preset)",
        args: ["--random", "--seed", "1"],
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
        command: "fairness",
        kind: "valid",
        label: "seed-commit <serverSeed.txt> (default, no --out — prints the commitment JSON)",
        args: ["seed-commit", "serverSeed.txt"],
        expectedExitCode: 0,
        expectStdout: "json",
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
        kind: "valid",
        label: "commit <serverSeedCommitment.json> --client-seed --nonce --source --mode (accepted --nonce value)",
        args: ["commit", "serverSeedCommitment.json", "--client-seed", "player-seed", "--nonce", "0", "--source", "bundleDir", "--mode", "base"],
        expectedExitCode: 0,
        expectStdout: "json",
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
        kind: "valid",
        label: "reveal <commitment.json> --server-seed --source",
        args: ["reveal", "commitment.json", "--server-seed", "serverSeed.txt", "--source", "bundleDir"],
        expectedExitCode: 0,
        expectStdout: "json",
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
        kind: "valid",
        label: "verify <proof.json> --commitment --source",
        args: ["verify", "proof.json", "--commitment", "commitment.json", "--source", "bundleDir"],
        expectedExitCode: 0,
        expectStdout: "text",
    },

    // --- init ---
    // No usage/options surface to freeze as an "invalid" case (see the CLI_COMMAND_DESCRIPTORS entry
    // above) — run() takes no args at all, so there is nothing for a caller to get wrong. Still gets
    // its own "valid" case, since InitCommand's sole dependency (its scaffolder) is just as injectable
    // as every other command's, so its accepted path is exercisable without touching this repo's own
    // working directory.
    {
        command: "init",
        kind: "valid",
        label: "(no args — scaffolds the current project via the injected scaffolder)",
        args: [],
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

    // --- outcomelibrary ---
    {
        command: "outcomelibrary",
        kind: "invalid",
        label: "missing/unknown subcommand",
        args: [],
        expectedExitCode: 1,
        expectedError:
            "Usage: pokie outcomelibrary build <config.json> [--out <dir>]\n" +
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

    // --- replay ---
    {
        command: "replay",
        kind: "invalid",
        label: "missing <packageRoot>",
        args: [],
        expectedExitCode: 1,
        expectedError: "Usage: pokie replay <packageRoot> --round <number> [--seed <string>] [--out <file>] [--format json]",
    },
    {
        command: "replay",
        kind: "invalid",
        label: "--round is required",
        args: ["pkg"],
        expectedExitCode: 1,
        expectedError:
            "--round is required. Usage: pokie replay <packageRoot> --round <number> [--seed <string>] [--out <file>] [--format json]",
    },
    {
        command: "replay",
        kind: "invalid",
        label: "--round must be a positive integer",
        args: ["pkg", "--round", "0"],
        expectedExitCode: 1,
        expectedError:
            "--round must be a positive integer. Usage: pokie replay <packageRoot> --round <number> [--seed <string>] [--out <file>] [--format json]",
    },
    {
        command: "replay",
        kind: "valid",
        label: "<packageRoot> --round <number> (accepted --round value, prints the replay JSON)",
        args: ["pkg", "--round", "3"],
        expectedExitCode: 0,
        expectStdout: "json",
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

    // --- serve ---
    {
        command: "serve",
        kind: "invalid",
        label: "missing <packageRoot>",
        args: [],
        expectedExitCode: 1,
        expectedError: "Usage: pokie serve <packageRoot> [--port <number>] [--host <string>]",
    },
    {
        command: "serve",
        kind: "invalid",
        label: "--port must be a non-negative integer",
        args: ["pkg", "--port", "-5"],
        expectedExitCode: 1,
        expectedError: "--port must be a non-negative integer. Usage: pokie serve <packageRoot> [--port <number>] [--host <string>]",
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
