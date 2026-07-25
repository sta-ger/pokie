import {SlotGameNameGenerating, SlotGameNameResult} from "pokie";
import {GameBlueprintWizard} from "../../../cli/wizard/GameBlueprintWizard.js";
import {PromptAdapting} from "../../../cli/wizard/PromptAdapting.js";

// A canned-answer test double for SlotGameNameGenerating: always returns the same suggestion (a
// stand-in for the seed-driven determinism SlotGameNameGenerator itself provides), and counts calls
// so a test can assert the wizard mints the suggestion at most once per run.
class FakeSlotGameNameGenerating implements SlotGameNameGenerating {
    public generateCalls = 0;
    private readonly result: SlotGameNameResult;

    constructor(result: SlotGameNameResult) {
        this.result = result;
    }

    public generate(): SlotGameNameResult {
        this.generateCalls++;
        return this.result;
    }

    public generateUnique(): SlotGameNameResult[] {
        throw new Error("FakeSlotGameNameGenerating.generateUnique is not used by GameBlueprintWizard.");
    }
}

const SUGGESTION: SlotGameNameResult = {
    title: "Blazing Riches",
    slug: "blazing-riches-4821",
    packageName: "blazing-riches",
    seed: 1,
};

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

    it("suggests a per-run id/name pair (slug -> id, title -> name) that Enter accepts", async () => {
        const nameGenerator = new FakeSlotGameNameGenerating(SUGGESTION);
        const prompt = new FakePromptAdapting([
            "", // id -> accept the suggested slug
            "", // name -> accept the suggested title
            "", // version -> default
            "", // reels -> default
            "", // rows -> default
            "A",
            "-",
            "",
            "",
            "",
            "",
        ]);

        const result = await new GameBlueprintWizard(nameGenerator).run(prompt);

        expect(result?.blueprint.manifest.id).toBe("blazing-riches-4821");
        expect(result?.blueprint.manifest.name).toBe("Blazing Riches");
        expect(prompt.questions[0]).toContain("[blazing-riches-4821]");
        expect(prompt.questions[1]).toContain("[Blazing Riches]");
    });

    it("lets a manually typed id override the suggestion, falling back to title-casing that id for the name default", async () => {
        const nameGenerator = new FakeSlotGameNameGenerating(SUGGESTION);
        const prompt = new FakePromptAdapting([
            "custom-game", // id -> manual, overrides the suggestion
            "", // name -> falls back to titleCaseFromId("custom-game"), not the suggestion's title
            "",
            "",
            "",
            "A",
            "-",
            "",
            "",
            "",
            "",
        ]);

        const result = await new GameBlueprintWizard(nameGenerator).run(prompt);

        expect(result?.blueprint.manifest.id).toBe("custom-game");
        expect(result?.blueprint.manifest.name).toBe("Custom Game");
    });

    it("keeps the suggested id stable across an invalid-id retry, minting it only once per run", async () => {
        const nameGenerator = new FakeSlotGameNameGenerating(SUGGESTION);
        const prompt = new FakePromptAdapting([
            "has/slash", // invalid -> reprompt, same suggestion must still be on offer
            "", // now accept the (unchanged) suggested slug
            "", // name
            "", // version
            "", // reels
            "", // rows
            "A", // symbols
            "-", // availableBets
            "", // paylines
            "", // paytable A
            "", // reel weighting
            "", // outDir
        ]);

        const result = await new GameBlueprintWizard(nameGenerator).run(prompt);

        expect(result?.blueprint.manifest.id).toBe("blazing-riches-4821");
        expect(prompt.questions.filter((q) => q.startsWith("Game id")).every((q) => q.includes("[blazing-riches-4821]"))).toBe(
            true,
        );
        expect(nameGenerator.generateCalls).toBe(1);
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

    it("reprompts when a paytable matchCount exceeds the chosen reel count", async () => {
        const prompt = new FakePromptAdapting([
            "crazy-fruits",
            "",
            "",
            "3", // reels
            "",
            "A",
            "-",
            "",
            "5:10", // paytable A attempt 1: matchCount 5 > reels 3 -> reprompt
            "3:10", // paytable A attempt 2: valid
            "",
            "",
        ]);

        const result = await new GameBlueprintWizard().run(prompt);

        expect(result?.blueprint.paytable).toEqual({A: {"3": 10}});
    });

    it("reprompts when symbol weights reference a symbol outside the declared symbol list", async () => {
        const prompt = new FakePromptAdapting([
            "crazy-fruits",
            "",
            "",
            "",
            "",
            "A,B",
            "-",
            "",
            "",
            "",
            "w",
            "A:8,C:2", // "C" was never declared -> reprompt
            "A:8,B:2",
            "",
        ]);

        const result = await new GameBlueprintWizard().run(prompt);

        expect(result?.blueprint.symbolWeights).toEqual({A: 8, B: 2});
    });

    it("reprompts when a reel strip references a symbol outside the declared symbol list", async () => {
        const prompt = new FakePromptAdapting([
            "crazy-fruits",
            "",
            "",
            "2", // reels
            "",
            "A,B",
            "-",
            "",
            "",
            "",
            "s",
            "A,X", // "X" was never declared -> reprompt
            "A,B",
            "B,A",
            "",
        ]);

        const result = await new GameBlueprintWizard().run(prompt);

        expect(result?.blueprint.reelStrips).toEqual([
            ["A", "B"],
            ["B", "A"],
        ]);
    });

    it("reprompts when a symbol id contains the reserved \":\" separator", async () => {
        const prompt = new FakePromptAdapting([
            "crazy-fruits",
            "",
            "",
            "",
            "",
            "A,B:1", // "B:1" isn't parseable later (paytable/weights use ":" as a separator) -> reprompt
            "A,B",
            "-",
            "",
            "",
            "",
            "",
            "",
        ]);

        const result = await new GameBlueprintWizard().run(prompt);

        expect(result?.blueprint.symbols).toEqual(["A", "B"]);
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
