import {GameBlueprint, GameBlueprintValidating, PokieProject, PROJECT_TYPE_CAPABILITIES, ProjectResolving, ValidationIssue} from "pokie";
import {EditCommand} from "../../../cli/commands/EditCommand.js";
import {GameBlueprintWizarding, GameBlueprintWizardOptions} from "../../../cli/wizard/GameBlueprintWizarding.js";
import {PromptAdapting} from "../../../cli/wizard/PromptAdapting.js";
import {WizardResult} from "../../../cli/wizard/WizardResult.js";

function createStubValidator(issues: ValidationIssue[]): GameBlueprintValidating & {calledWith?: unknown} {
    return {
        validate(blueprint: unknown) {
            this.calledWith = blueprint;
            return issues;
        },
    };
}

function stubProjectResolver(project: PokieProject | undefined): ProjectResolving & {calls: string[]} {
    const calls: string[] = [];
    return {
        calls,
        resolve(targetPath: string) {
            calls.push(targetPath);
            return Promise.resolve(project);
        },
    };
}

// A canned-answer test double for GameBlueprintWizarding: mirrors CreateCommand.test.ts's own
// createStubWizard, plus captures the given default blueprint (the one EditCommand's own
// createWizard() factory was called with) and the GameBlueprintWizardOptions the run itself was
// called with (editing/destination), so a test can assert those were threaded through correctly
// without exercising the real wizard's own prompt-driven question flow (already covered by
// GameBlueprintWizard.test.ts).
function createStubWizardFactory(
    result: WizardResult | null | Error,
): ((defaultBlueprint: GameBlueprint) => GameBlueprintWizarding) & {calledWithDefault?: GameBlueprint; calledWithOptions?: GameBlueprintWizardOptions} {
    const factory = (defaultBlueprint: GameBlueprint): GameBlueprintWizarding => {
        extended.calledWithDefault = defaultBlueprint;
        return {
            run(_prompt: PromptAdapting, options?: GameBlueprintWizardOptions) {
                extended.calledWithOptions = options;
                return result instanceof Error ? Promise.reject(result) : Promise.resolve(result);
            },
        };
    };
    const extended = factory as typeof factory & {calledWithDefault?: GameBlueprint; calledWithOptions?: GameBlueprintWizardOptions};
    return extended;
}

// A controllable PromptAdapting stand-in for the post-diff "Save this blueprint? [Y/n]" question --
// every ask() (there is ever at most one, for that confirmation) resolves with the same canned answer,
// or null to simulate Ctrl+C/EOF at that specific question.
function createControllablePrompt(confirmAnswer: string | null): PromptAdapting & {closed: boolean; askCalls: string[]} {
    return {
        closed: false,
        askCalls: [],
        ask(question: string) {
            this.askCalls.push(question);
            return Promise.resolve(confirmAnswer);
        },
        close() {
            this.closed = true;
        },
    };
}

const originalBlueprint: GameBlueprint = {
    manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
    reels: 5,
    rows: 3,
    symbols: ["A", "K"],
    paytable: {A: {"3": 5}, K: {"3": 3}},
};

const editedBlueprint: GameBlueprint = {
    manifest: {id: "sample-slot", name: "Sample Slot", version: "0.2.0"},
    reels: 5,
    rows: 3,
    symbols: ["A", "K", "Q"],
    paytable: {A: {"3": 5}, K: {"3": 3}, Q: {"3": 1}},
};

function createCommand(
    loadBlueprint: jest.Mock = jest.fn().mockReturnValue(originalBlueprint),
    validator = createStubValidator([]),
    resolveProject: ProjectResolving = stubProjectResolver(undefined),
    writeFile: jest.Mock = jest.fn().mockResolvedValue(undefined),
    wizardFactory: ((defaultBlueprint: GameBlueprint) => GameBlueprintWizarding) | undefined = undefined,
    createPrompt: (() => PromptAdapting) | undefined = undefined,
    isInteractiveTerminal: (() => boolean) | undefined = undefined,
) {
    const command = new EditCommand(loadBlueprint, validator, resolveProject, writeFile, wizardFactory, createPrompt, isInteractiveTerminal);
    return {command, loadBlueprint, writeFile, validator};
}

describe("EditCommand", () => {
    let logSpy: jest.SpyInstance;
    let errorSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
        errorSpy = jest.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        logSpy.mockRestore();
        errorSpy.mockRestore();
    });

    it("reports a capability diagnostic, without ever loading the file, for a resolved non-\"blueprint\" target", async () => {
        const project = {
            type: "tsPackage",
            rootPath: "/some/existing/package",
            capabilities: PROJECT_TYPE_CAPABILITIES.tsPackage,
            provenance: "test fixture",
        } as PokieProject;
        const loadBlueprint = jest.fn();
        const resolveProject = stubProjectResolver(project);
        const {command} = createCommand(loadBlueprint, undefined, resolveProject);

        await expect(command.run(["/some/existing/package"])).rejects.toThrow(
            /"edit" is not supported for a "tsPackage" project \(missing the "blueprint\.build" capability\)/,
        );

        expect(resolveProject.calls).toEqual(["/some/existing/package"]);
        expect(loadBlueprint).not.toHaveBeenCalled();
    });

    it('reaches loadBlueprint unchanged for a resolved "blueprint" target', async () => {
        const project = {
            type: "blueprint",
            rootPath: "/some/game.blueprint.json",
            capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
            provenance: "test fixture",
        } as PokieProject;
        const resolveProject = stubProjectResolver(project);
        const {command, loadBlueprint} = createCommand(undefined, undefined, resolveProject, undefined, undefined, undefined, () => false);

        const exitCode = await command.run(["/some/game.blueprint.json"]);

        expect(exitCode).toBe(1); // non-interactive guidance -- see the dedicated test below
        expect(loadBlueprint).toHaveBeenCalledWith("/some/game.blueprint.json");
    });

    it("still reaches loadBlueprint unchanged for a path ProjectResolving doesn't recognize", async () => {
        const {command, loadBlueprint} = createCommand(undefined, undefined, stubProjectResolver(undefined), undefined, undefined, undefined, () => false);

        await command.run(["game.blueprint.json"]);

        expect(loadBlueprint).toHaveBeenCalledWith("game.blueprint.json");
    });

    it("exits 1 with guidance, never touching the wizard, when stdin/stdout isn't a real terminal", async () => {
        const wizardFactory = createStubWizardFactory(null);
        const {command} = createCommand(undefined, undefined, undefined, undefined, wizardFactory, undefined, () => false);

        const exitCode = await command.run(["game.blueprint.json"]);

        expect(exitCode).toBe(1);
        expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining("needs an interactive terminal"));
        expect(wizardFactory.calledWithDefault).toBeUndefined();
    });

    it("passes editing:true and a destination that defaults to the loaded file's own path", async () => {
        const wizardFactory = createStubWizardFactory({blueprint: editedBlueprint, outDir: "game.blueprint.json"});
        const prompt = createControllablePrompt("y");
        const {command} = createCommand(
            jest.fn().mockReturnValue(originalBlueprint),
            undefined,
            undefined,
            undefined,
            wizardFactory,
            () => prompt,
            () => true,
        );

        await command.run(["game.blueprint.json"]);

        expect(wizardFactory.calledWithDefault).toBe(originalBlueprint);
        expect(wizardFactory.calledWithOptions?.editing).toBe(true);
        expect(wizardFactory.calledWithOptions?.destination?.defaultPathFor("ignored")).toBe("game.blueprint.json");
    });

    it("threads --out through the destination's own default path", async () => {
        const wizardFactory = createStubWizardFactory({blueprint: editedBlueprint, outDir: "copy.blueprint.json"});
        const prompt = createControllablePrompt("y");
        const {command} = createCommand(undefined, undefined, undefined, undefined, wizardFactory, () => prompt, () => true);

        await command.run(["game.blueprint.json", "--out", "copy.blueprint.json"]);

        expect(wizardFactory.calledWithOptions?.destination?.defaultPathFor("ignored")).toBe("copy.blueprint.json");
    });

    it("prints 'Edit cancelled.' and never writes anything when the wizard itself resolves null (Ctrl+C/EOF)", async () => {
        const wizardFactory = createStubWizardFactory(null);
        const prompt = createControllablePrompt("y");
        const {command, writeFile} = createCommand(undefined, undefined, undefined, undefined, wizardFactory, () => prompt, () => true);

        const exitCode = await command.run(["game.blueprint.json"]);

        expect(exitCode).toBe(1);
        expect(logSpy).toHaveBeenCalledWith("\nEdit cancelled.");
        expect(writeFile).not.toHaveBeenCalled();
        expect(prompt.closed).toBe(true);
    });

    it("prints validation errors and writes nothing when the edited blueprint has errors", async () => {
        const wizardFactory = createStubWizardFactory({blueprint: editedBlueprint, outDir: "game.blueprint.json"});
        const validator = createStubValidator([{severity: "error", code: "bad-thing", message: "It is bad."} as ValidationIssue]);
        const prompt = createControllablePrompt("y");
        const {command, writeFile} = createCommand(undefined, validator, undefined, undefined, wizardFactory, () => prompt, () => true);

        const exitCode = await command.run(["game.blueprint.json"]);

        expect(exitCode).toBe(1);
        expect(errorSpy).toHaveBeenCalledWith("Blueprint has 1 error(s):");
        expect(writeFile).not.toHaveBeenCalled();
        expect(prompt.askCalls).toEqual([]); // never even reaches the confirmation
    });

    it("prints a diff, asks for confirmation, and writes nothing when declined", async () => {
        const wizardFactory = createStubWizardFactory({blueprint: editedBlueprint, outDir: "game.blueprint.json"});
        const prompt = createControllablePrompt("n");
        const {command, writeFile} = createCommand(undefined, undefined, undefined, undefined, wizardFactory, () => prompt, () => true);

        const exitCode = await command.run(["game.blueprint.json"]);

        expect(exitCode).toBe(1);
        expect(logSpy).toHaveBeenCalledWith("\nEdit cancelled.");
        expect(writeFile).not.toHaveBeenCalled();
        expect(prompt.askCalls).toEqual(["Save this blueprint? [Y/n]: "]);
        // The diff itself lists exactly the fields that actually changed between original and edited.
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("version: 0.1.0 -> 0.2.0"));
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('symbols: ["A","K"] -> ["A","K","Q"]'));
    });

    it("writes the edited blueprint atomically to the resolved destination once confirmed", async () => {
        const wizardFactory = createStubWizardFactory({blueprint: editedBlueprint, outDir: "game.blueprint.json"});
        const prompt = createControllablePrompt("y");
        const {command, writeFile} = createCommand(undefined, undefined, undefined, undefined, wizardFactory, () => prompt, () => true);

        const exitCode = await command.run(["game.blueprint.json"]);

        expect(exitCode).toBe(0);
        expect(writeFile).toHaveBeenCalledWith("game.blueprint.json", `${JSON.stringify(editedBlueprint, null, 4)}\n`);
        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("saved  game.blueprint.json"));
        expect(prompt.closed).toBe(true);
    });

    it("prints '(no changes)' when the wizard returns the same blueprint back unedited", async () => {
        const wizardFactory = createStubWizardFactory({blueprint: originalBlueprint, outDir: "game.blueprint.json"});
        const prompt = createControllablePrompt("y");
        const {command} = createCommand(undefined, undefined, undefined, undefined, wizardFactory, () => prompt, () => true);

        await command.run(["game.blueprint.json"]);

        expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("(no changes)"));
    });
});
