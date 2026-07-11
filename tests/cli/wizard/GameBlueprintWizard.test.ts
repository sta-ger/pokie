import {GameBlueprintWizard} from "../../../cli/wizard/GameBlueprintWizard.js";
import {PromptAdapting} from "../../../cli/wizard/PromptAdapting.js";

// A canned-answer test double for PromptAdapting: each ask() call consumes the next queued answer
// (or, if it's null, simulates Ctrl+C / EOF cancellation) — the "dedicated prompt adapter" seam the
// wizard is built against, so these tests never touch real stdin/stdout or readline.
class FakePromptAdapting implements PromptAdapting {
    public readonly questions: string[] = [];
    public closed = false;
    private readonly answers: (string | null)[];

    constructor(answers: (string | null)[]) {
        this.answers = [...answers];
    }

    public ask(question: string): Promise<string | null> {
        this.questions.push(question);
        if (this.answers.length === 0) {
            throw new Error(`FakePromptAdapting ran out of canned answers at question: "${question}"`);
        }
        return Promise.resolve(this.answers.shift() as string | null);
    }

    public close(): void {
        this.closed = true;
    }
}

describe("GameBlueprintWizard", () => {
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
        logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        logSpy.mockRestore();
    });

    it("builds a full blueprint from answers, applying defaults for blank input", async () => {
        const prompt = new FakePromptAdapting([
            "crazy-fruits", // id
            "", // name -> default "Crazy Fruits"
            "", // version -> default "0.1.0"
            "", // reels -> default 5
            "", // rows -> default 3
            "A,K", // symbols
            "", // availableBets -> default
            "", // paylines -> default (omitted)
            "3:5,4:10,5:20", // paytable A
            "", // paytable K -> skipped
            "w", // reel weighting mode
            "A:8,K:2", // symbol weights
            "", // outDir -> default
        ]);

        const result = await new GameBlueprintWizard().run(prompt);

        expect(result).toEqual({
            blueprint: {
                manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
                reels: 5,
                rows: 3,
                symbols: ["A", "K"],
                paytable: {A: {"3": 5, "4": 10, "5": 20}},
                symbolWeights: {A: 8, K: 2},
                availableBets: [1, 2, 5, 10],
            },
            outDir: undefined,
        });
        expect(prompt.closed).toBe(false); // BuildCommand owns close(), not the wizard
    });

    it("reprompts on an invalid game id and accepts the next valid one", async () => {
        const prompt = new FakePromptAdapting([
            "has/slash",
            "crazy-fruits",
            "Crazy Fruits",
            "0.1.0",
            "5",
            "3",
            "A",
            "-",
            "",
            "",
            "",
            "out",
        ]);

        const result = await new GameBlueprintWizard().run(prompt);

        expect(result?.blueprint.manifest.id).toBe("crazy-fruits");
        expect(prompt.questions.filter((q) => q.startsWith("Game id")).length).toBe(2);
    });

    it("reprompts on a non-numeric reels answer", async () => {
        const prompt = new FakePromptAdapting([
            "crazy-fruits",
            "",
            "",
            "not-a-number",
            "5",
            "3",
            "A",
            "-",
            "",
            "",
            "",
            "",
        ]);

        const result = await new GameBlueprintWizard().run(prompt);

        expect(result?.blueprint.reels).toBe(5);
        expect(prompt.questions.filter((q) => q.startsWith("Number of reels")).length).toBe(2);
    });

    it("reprompts on duplicate symbol ids", async () => {
        const prompt = new FakePromptAdapting([
            "crazy-fruits",
            "",
            "",
            "",
            "",
            "A,A",
            "A,K",
            "-",
            "",
            "",
            "",
            "",
            "",
        ]);

        const result = await new GameBlueprintWizard().run(prompt);

        expect(result?.blueprint.symbols).toEqual(["A", "K"]);
    });

    it("omits availableBets when answered with \"-\"", async () => {
        const prompt = new FakePromptAdapting(["crazy-fruits", "", "", "", "", "A", "-", "", "", "", ""]);

        const result = await new GameBlueprintWizard().run(prompt);

        expect(result?.blueprint.availableBets).toBeUndefined();
    });

    it("parses custom paylines and reprompts on a wrong-length line", async () => {
        const prompt = new FakePromptAdapting([
            "crazy-fruits",
            "",
            "",
            "2", // reels
            "2", // rows
            "A,B",
            "-",
            "0,0,0", // wrong length for 2 reels -> reprompt
            "0,0;1,1", // valid: two paylines of length 2
            "", // paytable A -> skip
            "", // paytable B -> skip
            "", // reel weighting -> engine default
            "", // outDir -> default
        ]);

        const result = await new GameBlueprintWizard().run(prompt);

        expect(result?.blueprint.paylines).toEqual([
            [0, 0],
            [1, 1],
        ]);
    });

    it("builds explicit reel strips, one per reel, when mode is 's'", async () => {
        const prompt = new FakePromptAdapting([
            "crazy-fruits",
            "",
            "",
            "2", // reels
            "",
            "A,B",
            "-",
            "",
            "", // paytable A -> skip
            "", // paytable B -> skip
            "s", // reel weighting: strips
            "A,B", // reel 1 strip
            "B,A", // reel 2 strip
            "out-dir",
        ]);

        const result = await new GameBlueprintWizard().run(prompt);

        expect(result?.blueprint.reelStrips).toEqual([
            ["A", "B"],
            ["B", "A"],
        ]);
        expect(result?.blueprint.symbolWeights).toBeUndefined();
        expect(result?.blueprint.paytable).toEqual({});
        expect(result?.outDir).toBe("out-dir");
    });

    it("omits both reelStrips and symbolWeights for the engine default (blank mode)", async () => {
        const prompt = new FakePromptAdapting(["crazy-fruits", "", "", "", "", "A", "-", "", "", "", ""]);

        const result = await new GameBlueprintWizard().run(prompt);

        expect(result?.blueprint.reelStrips).toBeUndefined();
        expect(result?.blueprint.symbolWeights).toBeUndefined();
    });

    it("resolves null when the user cancels on the very first question", async () => {
        const prompt = new FakePromptAdapting([null]);

        const result = await new GameBlueprintWizard().run(prompt);

        expect(result).toBeNull();
    });

    it("resolves null when the user cancels partway through (e.g. mid-paytable)", async () => {
        const prompt = new FakePromptAdapting([
            "crazy-fruits",
            "",
            "",
            "",
            "",
            "A,K",
            "-",
            "",
            "3:5,4:10,5:20", // paytable A
            null, // Ctrl+C on paytable K
        ]);

        const result = await new GameBlueprintWizard().run(prompt);

        expect(result).toBeNull();
    });
});
