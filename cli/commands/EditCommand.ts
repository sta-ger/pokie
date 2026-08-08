import {Command} from "commander";
import fs from "fs";
import {
    describeUnsupportedProjectOperation,
    EDIT_OPERATION,
    GameBlueprint,
    GameBlueprintValidating,
    GameBlueprintValidator,
    loadGameBlueprint,
    ProjectResolving,
    ProjectTargetResolver,
    writeFileAtomically,
} from "pokie";
import {CliCommandHandling} from "../CliCommandHandling.js";
import {UnsupportedProjectOperationError} from "../materialize/UnsupportedProjectOperationError.js";
import {GameBlueprintWizard} from "../wizard/GameBlueprintWizard.js";
import {GameBlueprintWizarding} from "../wizard/GameBlueprintWizarding.js";
import {PromptAdapting} from "../wizard/PromptAdapting.js";
import {ReadlinePromptAdapter} from "../wizard/ReadlinePromptAdapter.js";
import {createCommanderCliCommand, isCommanderHelpDisplay, translateCommanderError} from "./internal/CommanderCliAdapter.js";

const USAGE = "Usage: pokie edit <blueprint> [--out <file>]";

const GUIDANCE_NOT_INTERACTIVE =
    "pokie edit needs an interactive terminal to run, and this one is not connected to one. Re-run inside a " +
    'terminal, or edit the Blueprint Project\'s JSON file directly, then check it with "pokie validate <packageRoot>" ' +
    'or "pokie build <blueprint> --target tsPackage --out <dir> --dry-run".';

// General, capability-aware interactive editing of an existing Blueprint Project via the same
// canonical GameBlueprint model/validation "pokie create"'s wizard and "pokie build" both already use
// (see GameBlueprintWizard) -- every question pre-fills the value already on the loaded blueprint and
// Enter preserves it (see GameBlueprintWizardOptions.editing), traversing the same sections "pokie
// create" does, then prints a diff against the loaded file and only writes it (atomically, in place, or
// to --out as a "Save As") once that diff is explicitly confirmed. A "generated" reelStripGeneration is
// carried through untouched rather than asked about -- "pokie reel generate" remains the one dedicated
// editor for that shape. Pointed at a non-"blueprint" project (tsPackage/wasm/outcomeLibrary/
// stakeAdapter/parWorkbook), it never even reaches the wizard: it reports the same resolver-derived
// capability diagnostic every other migrated CLI command does (see describeUnsupportedProjectOperation).
export class EditCommand implements CliCommandHandling {
    private readonly loadBlueprint: (filePath: string) => GameBlueprint;
    private readonly validator: GameBlueprintValidating;
    private readonly resolveProject: ProjectResolving;
    private readonly writeFile: (filePath: string, contents: string) => Promise<void>;
    private readonly createWizard: (defaultBlueprint: GameBlueprint) => GameBlueprintWizarding;
    private readonly createPrompt: () => PromptAdapting;
    private readonly isInteractiveTerminal: () => boolean;

    constructor(
        loadBlueprint: (filePath: string) => GameBlueprint = loadGameBlueprint,
        validator: GameBlueprintValidating = new GameBlueprintValidator(),
        resolveProject: ProjectResolving = new ProjectTargetResolver(),
        // Overwrite-capable and atomic (see writeFileAtomically's own doc): unlike "pokie create"'s
        // create-only commit, editing an existing file is expected to replace it -- the write is still
        // staged beside the destination and renamed into place, so a failed/interrupted write can never
        // leave either the destination or a --out target truncated or partially replaced.
        writeFile: (filePath: string, contents: string) => Promise<void> = (filePath, contents) =>
            writeFileAtomically(filePath, (tempPath) => fs.promises.writeFile(tempPath, contents, "utf-8")),
        // A fresh GameBlueprintWizard per invocation, seeded with the loaded blueprint as its own
        // defaults -- unlike CreateCommand's single shared instance (always seeded with the same starter
        // template), every "pokie edit" run targets a different file, so its defaults can't be fixed at
        // construction time the way CreateCommand's can.
        createWizard: (defaultBlueprint: GameBlueprint) => GameBlueprintWizarding = (defaultBlueprint) =>
            new GameBlueprintWizard(undefined, () => defaultBlueprint),
        createPrompt: () => PromptAdapting = () => new ReadlinePromptAdapter(),
        isInteractiveTerminal: () => boolean = () => Boolean(process.stdin.isTTY) && Boolean(process.stdout.isTTY),
    ) {
        this.loadBlueprint = loadBlueprint;
        this.validator = validator;
        this.resolveProject = resolveProject;
        this.writeFile = writeFile;
        this.createWizard = createWizard;
        this.createPrompt = createPrompt;
        this.isInteractiveTerminal = isInteractiveTerminal;
    }

    public getName(): string {
        return "edit";
    }

    public getDescription(): string {
        return (
            "Interactively edit an existing Blueprint Project through the same canonical GameBlueprint wizard " +
            '"pokie create" uses ("pokie edit <blueprint> [--out <file>]") -- every question pre-fills the ' +
            "current value and Enter preserves it, then a diff against the loaded file is shown and nothing is " +
            'written until it\'s explicitly confirmed. --out saves the result to a different file instead of ' +
            'overwriting <blueprint> ("Save As"). Pointed at a non-Blueprint project (tsPackage/wasm/' +
            "outcomeLibrary/stakeAdapter/parWorkbook), reports why it can't be edited here instead of running the " +
            'wizard. A "generated" reelStripGeneration is left untouched -- see "pokie reel generate" for that.'
        );
    }

    public getCommanderCommand(): Command {
        return this.buildCommand();
    }

    public run(args: string[]): Promise<number> {
        const resultRef: {value?: number} = {};
        const command = this.buildCommand(resultRef);

        return command
            .parseAsync(args, {from: "user"})
            .then(() => resultRef.value!)
            .catch((error: unknown) => {
                if (isCommanderHelpDisplay(error)) {
                    return 0;
                }
                throw translateCommanderError(error, {
                    missingArgument: USAGE,
                    unknownOption: (flag) => `Unknown option "${flag}". ${USAGE}`,
                    optionMissingArgument: (flag) => (flag === "--out" ? `--out requires a file path. ${USAGE}` : `Unknown option "${flag}". ${USAGE}`),
                });
            });
    }

    // Builds the exact Commander tree run() itself parses argv with -- the same object graph both
    // getCommanderCommand() (for help-coverage introspection) and run() (for real parsing) use, so the
    // two can never drift apart. `resultRef` is written by the action; run() supplies its own real box
    // and reads it back once parsing resolves, while getCommanderCommand() never parses this tree at
    // all, so its own default box is never read.
    private buildCommand(resultRef: {value?: number} = {}): Command {
        return createCommanderCliCommand("edit")
            .description(this.getDescription())
            .argument("<blueprint>", "an existing Blueprint Project file to edit")
            .argument("[excess...]", "rejected if present -- this command takes no further positionals")
            .option("--out <file>", "save the edited blueprint here instead of overwriting <blueprint> (\"Save As\")")
            .action(async (blueprintPath: string, excess: string[], options: {out?: string}) => {
                if (excess.length > 0) {
                    throw new Error(`Unexpected extra argument "${excess[0]}". ${USAGE}`);
                }
                resultRef.value = await this.executeEdit(blueprintPath, options.out);
            });
    }

    // Routes `blueprintPath` through the same ProjectTargetResolver every migrated CLI command already
    // crosses (see ParCommand's own analogous check) before ever loading it as a GameBlueprint -- but
    // only ever rejects a *recognized*-but-wrong-type target with a capability diagnostic explaining
    // exactly why editing can't run against it. An unrecognized path (resolve() returns undefined -- a
    // missing file, or an ordinary/corrupt JSON file that doesn't resolve as any known project type)
    // falls straight through to loadBlueprint(), so its own "could not read"/"not valid JSON" errors are
    // unaffected.
    private async checkEditTarget(blueprintPath: string): Promise<void> {
        const project = await this.resolveProject.resolve(blueprintPath);
        if (project === undefined || project.type === "blueprint") {
            return;
        }
        const diagnostic = describeUnsupportedProjectOperation(project, EDIT_OPERATION);
        if (diagnostic !== undefined) {
            throw new UnsupportedProjectOperationError(diagnostic);
        }
    }

    private async executeEdit(blueprintPath: string, out: string | undefined): Promise<number> {
        await this.checkEditTarget(blueprintPath);
        const original = this.loadBlueprint(blueprintPath);

        if (!this.isInteractiveTerminal()) {
            console.error(GUIDANCE_NOT_INTERACTIVE);
            return 1;
        }

        const wizard = this.createWizard(original);
        const prompt = this.createPrompt();
        try {
            const result = await wizard.run(prompt, {
                editing: true,
                destination: {label: "Save to", defaultPathFor: () => out ?? blueprintPath},
            });
            if (result === null) {
                console.log("\nEdit cancelled.");
                return 1;
            }

            const {blueprint} = result;
            // --out is a fixed Save As destination, not just the destination question's own default --
            // it always wins over whatever the wizard's own (still-editable) prompt reports back, so a
            // wizard-entered alternate path can never redirect an explicit --out write.
            const savePath = out ?? (result.outDir as string); // always concrete -- see GameBlueprintWizardOptions.destination

            const issues = this.validator.validate(blueprint);
            const errors = issues.filter((issue) => issue.severity === "error");
            for (const issue of issues.filter((issue) => issue.severity !== "error")) {
                console.log(`  warning  ${issue.code}: ${issue.message}`);
            }
            if (errors.length > 0) {
                console.error(`Blueprint has ${errors.length} error(s):`);
                for (const issue of errors) {
                    console.error(`  - ${issue.code}: ${issue.message}`);
                }
                return 1;
            }

            this.printDiff(original, blueprint, savePath);
            const confirmed = await this.confirmSave(prompt);
            if (!confirmed) {
                console.log("\nEdit cancelled.");
                return 1;
            }

            await this.writeFile(savePath, `${JSON.stringify(blueprint, null, 4)}\n`);
            console.log(`\n  saved  ${savePath}`);
            console.log(`\nGame blueprint "${blueprint.manifest.name}" (id: "${blueprint.manifest.id}") saved at "${savePath}".`);
            return 0;
        } finally {
            prompt.close();
        }
    }

    private printDiff(original: GameBlueprint, edited: GameBlueprint, savePath: string): void {
        const lines = this.diffLines(original, edited);
        console.log("\nChanges:");
        if (lines.length === 0) {
            console.log("  (no changes)");
        } else {
            for (const line of lines) {
                console.log(`  ${line}`);
            }
        }
        console.log(`\nDestination: ${savePath}`);
    }

    private diffLines(original: GameBlueprint, edited: GameBlueprint): string[] {
        const lines: string[] = [];
        const changed = (label: string, before: unknown, after: unknown): void => {
            if (JSON.stringify(before) !== JSON.stringify(after)) {
                lines.push(`${label}: ${this.formatDiffValue(before)} -> ${this.formatDiffValue(after)}`);
            }
        };

        changed("id", original.manifest.id, edited.manifest.id);
        changed("name", original.manifest.name, edited.manifest.name);
        changed("version", original.manifest.version, edited.manifest.version);
        changed("reels", original.reels, edited.reels);
        changed("rows", original.rows, edited.rows);
        changed("symbols", original.symbols, edited.symbols);
        changed("wilds", original.wilds, edited.wilds);
        changed("scatters", original.scatters, edited.scatters);
        changed("availableBets", original.availableBets, edited.availableBets);
        changed("paylines", original.paylines, edited.paylines);
        changed("paytable", original.paytable, edited.paytable);
        changed("reelStrips", original.reelStrips, edited.reelStrips);
        changed("symbolWeights", original.symbolWeights, edited.symbolWeights);
        changed("reelStripGeneration", original.reelStripGeneration, edited.reelStripGeneration);
        changed("mechanics", original.mechanics, edited.mechanics);

        return lines;
    }

    private formatDiffValue(value: unknown): string {
        if (value === undefined) {
            return "(none)";
        }
        if (typeof value === "object") {
            return JSON.stringify(value);
        }
        return String(value);
    }

    private async confirmSave(prompt: PromptAdapting): Promise<boolean> {
        for (;;) {
            const raw = await prompt.ask("Save this blueprint? [Y/n]: ");
            if (raw === null) {
                return false;
            }
            const answer = raw.trim().toLowerCase();
            if (answer === "" || answer === "y" || answer === "yes") {
                return true;
            }
            if (answer === "n" || answer === "no") {
                return false;
            }
            console.log('  Enter "y" or "n".');
        }
    }
}
