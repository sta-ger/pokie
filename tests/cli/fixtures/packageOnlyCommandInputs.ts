// Freezes one specific cross-cutting fact about the CLI surface ahead of Phase 3 migration work:
// which public `pokie` commands take an already-loadable game *package* (a directory satisfying the
// `PokieGame`/`pokie.entry` contract `loadPokieGame`/`findPokieProjectRoot` read -- produced by
// `pokie build` or `pokie init`, not "built" in any narrower sense; `pokie create` writes a source
// Blueprint Project instead, not a package -- see that command's own entry below) as their one
// required input, vs. every other command, whose required input is a source config/blueprint, a
// previously-produced bundle/export/report artifact, a plain file, a project directory to write into,
// or nothing at all. This axis matters specifically for a future migration step that wants to relax the
// "package-only" requirement (e.g. letting `pokie sim` run straight off a blueprint, no build step
// first) -- see docs/pokie-phase3-inventory.md, which this fixture backs.
//
// PACKAGE_ONLY_COMMAND_INPUTS is deliberately NOT a general-purpose input-kind taxonomy for every
// command (that would just re-derive CLI_COMMAND_DESCRIPTORS' own `positionals`/`usage` fields under a
// different name) -- it only records the one boolean this document's "package-only command inputs"
// section actually needs, plus a short human description for that section's own table.
export type PackageOnlyCommandInput = {
    command: string;
    // Matches CliVerbDescriptor.verb exactly (see cliCommandInventory.ts).
    verb: string | undefined;
    // True iff this verb's one required positional is an existing, loadable POKIE game package
    // directory -- i.e. this command can do nothing at all without one already on disk, produced by a
    // prior `pokie build`/`create`/`init` run (or hand-assembled to the same contract).
    requiresLoadablePackage: boolean;
    // Short human description of what this verb's own primary required input actually is -- always the
    // literal `positionals[0]` string from CLI_COMMAND_DESCRIPTORS when one exists, so this stays a
    // plain restatement of that fixture's own frozen positional name, not an independent guess.
    primaryInput: string;
};

// One entry per (command, verb) pair in CLI_COMMAND_DESCRIPTORS (tests/cli/fixtures/cliCommandInventory.ts) --
// coverage of that full set is asserted by tests/cli/packageOnlyCommandInputs.contract.test.ts, so this
// list can't silently drift out of sync with a future command/verb addition, rename, or removal.
export const PACKAGE_ONLY_COMMAND_INPUTS: PackageOnlyCommandInput[] = [
    // --- build: builds/republishes an artifact from a resolved POKIE project; never reads an existing package
    // as its own input (a "tsPackage" target only ever writes one, never reads one back). ---
    {command: "build", verb: undefined, requiresLoadablePackage: false, primaryInput: "project (a GameBlueprint source, or an already-built tsPackage/outcomeLibrary/stakeAdapter/parWorkbook artifact)"},

    // --- certification: reads a previously-built outcome-library bundle / evidence bundle, never a package. ---
    {command: "certification", verb: "build", requiresLoadablePackage: false, primaryInput: "bundleDir (an Outcome Library Bundle) + config.json"},
    {command: "certification", verb: "verify", requiresLoadablePackage: false, primaryInput: "certDir (a certification evidence bundle) + --source bundleDir"},

    // --- client/dev/inspect/replay/serve/sim/validate + outcomelibrary generate: package-only. ---
    {command: "client", verb: undefined, requiresLoadablePackage: true, primaryInput: "packageRoot"},
    {command: "dev", verb: undefined, requiresLoadablePackage: true, primaryInput: "packageRoot"},

    // --- create: writes an editable Blueprint Project (a GameBlueprint JSON file); never reads a package. ---
    {command: "create", verb: undefined, requiresLoadablePackage: false, primaryInput: "name (optional; pre-fills the interactive wizard, which names the written blueprint file)"},
    {command: "create", verb: "--blank", requiresLoadablePackage: false, primaryInput: "name (optional; names the written blueprint file)"},
    {command: "create", verb: "--random", requiresLoadablePackage: false, primaryInput: "name (optional; names the written blueprint file)"},

    {command: "diff", verb: undefined, requiresLoadablePackage: false, primaryInput: "leftReportJson + rightReportJson (pokie sim --out reports)"},

    // --- edit: interactively edits an existing Blueprint Project (a GameBlueprint JSON file) in place; never
    // reads/loads a runnable package. ---
    {command: "edit", verb: undefined, requiresLoadablePackage: false, primaryInput: "blueprint (an existing Blueprint Project file)"},

    // --- fairness: reads a bundleDir/plain seed-and-proof files, never a package directly. ---
    {command: "fairness", verb: "seed-commit", requiresLoadablePackage: false, primaryInput: "serverSeed.txt"},
    {command: "fairness", verb: "commit", requiresLoadablePackage: false, primaryInput: "serverSeedCommitment.json + --source bundleDir"},
    {command: "fairness", verb: "reveal", requiresLoadablePackage: false, primaryInput: "commitment.json + --server-seed + --source bundleDir"},
    {command: "fairness", verb: "verify", requiresLoadablePackage: false, primaryInput: "proof.json + --commitment + --source bundleDir"},

    // init: merges/prepares a package in place -- an optional "directory" positional (defaults to "."),
    // never an existing package (a pre-existing package.json in that directory is patched, not read as
    // this command's own input the way e.g. "build"'s config.json is).
    {command: "init", verb: undefined, requiresLoadablePackage: false, primaryInput: "directory (optional; defaults to the current directory)"},

    {command: "inspect", verb: undefined, requiresLoadablePackage: true, primaryInput: "packageRoot"},

    {command: "name", verb: undefined, requiresLoadablePackage: false, primaryInput: "none"},

    // --- outcomelibrary: "generate" is the one package-only verb; build/validate read config/bundleDir. ---
    {command: "outcomelibrary", verb: "build", requiresLoadablePackage: false, primaryInput: "config.json"},
    {command: "outcomelibrary", verb: "validate", requiresLoadablePackage: false, primaryInput: "bundleDir"},
    {command: "outcomelibrary", verb: "generate", requiresLoadablePackage: true, primaryInput: "packageRoot"},

    // --- par: a source workbook / a blueprint config -- never a package. ---
    {command: "par", verb: "import", requiresLoadablePackage: false, primaryInput: "input.xlsx (a PAR sheet workbook)"},
    {command: "par", verb: "export", requiresLoadablePackage: false, primaryInput: "config.json (a GameBlueprint)"},

    // reel generate: reads/writes a Blueprint's own reelStripGeneration in place -- never a package.
    {command: "reel", verb: "generate", requiresLoadablePackage: false, primaryInput: "blueprint.json (a GameBlueprint)"},

    {command: "replay", verb: undefined, requiresLoadablePackage: true, primaryInput: "packageRoot"},

    {command: "report", verb: undefined, requiresLoadablePackage: false, primaryInput: "simulationReportJson (a pokie sim --out report)"},

    {command: "serve", verb: undefined, requiresLoadablePackage: true, primaryInput: "packageRoot"},
    {command: "sim", verb: undefined, requiresLoadablePackage: true, primaryInput: "packageRoot"},

    // --- stakeengine: a config / a previously-exported Stake Engine directory -- never a package. ---
    {command: "stakeengine", verb: "export", requiresLoadablePackage: false, primaryInput: "config.json"},
    {command: "stakeengine", verb: "import", requiresLoadablePackage: false, primaryInput: "stakeDir"},
    {command: "stakeengine", verb: "analyze", requiresLoadablePackage: false, primaryInput: "stakeDir"},
    {command: "stakeengine", verb: "diff", requiresLoadablePackage: false, primaryInput: "leftStakeDir + rightStakeDir"},

    // studio: its own positional is OPTIONAL (bare `pokie`/`pokie studio` opens Home with no project at
    // all) and, when given, is resolved via the same findPokieProjectRoot/isPokiePackage check the
    // package-only commands above use -- but since a package is never *required* to invoke this command
    // successfully, it's excluded from the strict package-only set (see docs/pokie-phase3-inventory.md's
    // own note on this).
    {command: "studio", verb: undefined, requiresLoadablePackage: false, primaryInput: "projectRoot (optional; resolves the same loadable-package contract as the commands above when given)"},

    {command: "validate", verb: undefined, requiresLoadablePackage: true, primaryInput: "packageRoot"},
];
