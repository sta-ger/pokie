import type {GameBlueprint, GameBlueprintValidating, ProjectResolving} from "@fromstan/pokie";
import {EditCommand} from "../../../cli/commands/EditCommand.js";
import type {PromptAdapting} from "../../../cli/wizard/PromptAdapting.js";

const blueprint: GameBlueprint = {
    info: {id: "edit-fixture", name: "Edit Fixture", version: "0.1.0"},
    reels: 3,
    rows: 3,
    symbols: ["A", "K", "Q"],
    paytable: {A: {3: 5}},
};

function promptWith(answer: string | null): PromptAdapting & {questions: string[]; closed: boolean} {
    const prompt = {
        questions: [] as string[],
        closed: false,
        ask(question: string): Promise<string | null> {
            prompt.questions.push(question);
            return Promise.resolve(answer);
        },
        close(): void {
            prompt.closed = true;
        },
    };
    return prompt;
}

function createCommand(overrides: {
    interactive: boolean;
    prompt?: PromptAdapting;
    writeFile?: (filePath: string, contents: string) => Promise<void>;
    wizardRun?: () => Promise<{blueprint: GameBlueprint; outDir: string} | null>;
}) {
    const prompt = overrides.prompt ?? promptWith("y");
    let wizardCalls = 0;
    const command = new EditCommand(
        () => blueprint,
        {validate: () => []} as unknown as GameBlueprintValidating,
        {resolve: () => Promise.resolve(undefined)} as ProjectResolving,
        overrides.writeFile ?? (() => Promise.resolve()),
        () => ({
            run: () => {
                wizardCalls++;
                return overrides.wizardRun?.() ?? Promise.resolve({blueprint, outDir: "ignored.json"});
            },
        }),
        () => prompt,
        () => overrides.interactive,
    );
    return {command, prompt, wizardCalls: () => wizardCalls};
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

    it("keeps the guidance path when stdin is neither a terminal nor piped answers", async () => {
        const {command, wizardCalls} = createCommand({interactive: false});

        expect(await command.run(["sample.blueprint.json"])).toBe(1);
        expect(wizardCalls()).toBe(0);
        expect(errorSpy.mock.calls.flat().join("\n")).toContain("interactive terminal or piped/scripted answers");
    });

    it("runs the wizard and writes the confirmed result when answers are interactive or piped", async () => {
        const prompt = promptWith("y");
        const writes: Array<{filePath: string; contents: string}> = [];
        const {command, wizardCalls} = createCommand({
            interactive: true,
            prompt,
            writeFile: (filePath, contents) => {
                writes.push({filePath, contents});
                return Promise.resolve();
            },
        });

        expect(await command.run(["sample.blueprint.json", "--out", "edited.blueprint.json"])).toBe(0);
        expect(wizardCalls()).toBe(1);
        expect(writes).toHaveLength(1);
        expect(writes[0].filePath).toBe("edited.blueprint.json");
        expect(JSON.parse(writes[0].contents)).toMatchObject({info: {id: "edit-fixture"}});
        expect(prompt.questions).toEqual(["Save this blueprint? [Y/n]: "]);
        expect(prompt.closed).toBe(true);
    });

    it("does not write when the final confirmation is declined", async () => {
        const {command} = createCommand({interactive: true, prompt: promptWith("n")});

        expect(await command.run(["sample.blueprint.json"])).toBe(1);
        expect(logSpy.mock.calls.flat().join("\n")).toContain("Edit cancelled.");
    });
});
