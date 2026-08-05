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

// slug and packageName deliberately differ: slug carries SlotGameNameGenerator's numeric uniqueness
// suffix, and the wizard must offer the plain packageName as the game id, never the suffixed form.
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
            "sample-slot", // id
            "", // name -> default "Sample Slot"
            "", // version -> default "0.1.0"
            "", // reels -> default 5
            "", // rows -> default 3
            "A,K", // symbols
            "", // wilds -> none
            "", // scatters -> none
            "", // availableBets -> default
            "", // paylines -> default (omitted)
            "3:5,4:10,5:20", // paytable A
            "", // paytable K -> the default payouts for K, not a skip
            "w", // reel weighting mode
            "A:8,K:2", // symbol weights
            "", // outDir -> default
        ]);

        const result = await new GameBlueprintWizard().run(prompt);

        expect(result).toEqual({
            blueprint: {
                manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
                reels: 5,
                rows: 3,
                symbols: ["A", "K"],
                paytable: {A: {"3": 5, "4": 10, "5": 20}, K: {"3": 3, "4": 6, "5": 12}},
                symbolWeights: {A: 8, K: 2},
                availableBets: [1, 2, 5],
            },
            outDir: undefined,
        });
        expect(prompt.closed).toBe(false); // BuildCommand owns close(), not the wizard
    });

    it("reprompts on an invalid game id and accepts the next valid one", async () => {
        const prompt = new FakePromptAdapting([
            "has/slash",
            "sample-slot",
            "Sample Slot",
            "0.1.0",
            "5",
            "3",
            "A",
            "",
            "",
            "-",
            "",
            "",
            "",
            "out",
        ]);

        const result = await new GameBlueprintWizard().run(prompt);

        expect(result?.blueprint.manifest.id).toBe("sample-slot");
        expect(prompt.questions.filter((q) => q.startsWith("Game id")).length).toBe(2);
    });

    it("suggests a per-run id/name pair (packageName -> id, title -> name) that Enter accepts", async () => {
        const nameGenerator = new FakeSlotGameNameGenerating(SUGGESTION);
        const prompt = new FakePromptAdapting([
            "", // id -> accept the suggested id
            "", // name -> accept the suggested title
            "", // version -> default
            "", // reels -> default
            "", // rows -> default
            "A",
            "",
            "",
            "-",
            "",
            "",
            "",
            "",
        ]);

        const result = await new GameBlueprintWizard(nameGenerator).run(prompt);

        expect(result?.blueprint.manifest.id).toBe("blazing-riches");
        expect(result?.blueprint.manifest.name).toBe("Blazing Riches");
        expect(prompt.questions[0]).toContain("[blazing-riches]");
        expect(prompt.questions[1]).toContain("[Blazing Riches]");
    });

    it("offers the plain name as the game id, never the generator's numerically suffixed slug", async () => {
        const nameGenerator = new FakeSlotGameNameGenerating(SUGGESTION);
        const prompt = new FakePromptAdapting(Array.from({length: 16}, () => ""));

        const result = await new GameBlueprintWizard(nameGenerator).run(prompt);

        expect(result?.blueprint.manifest.id).toBe("blazing-riches");
        expect(prompt.questions.join("\n")).not.toContain(SUGGESTION.slug);
    });

    it("asks for the game id without an inline example, since the default already shows the shape", async () => {
        const prompt = new FakePromptAdapting(Array.from({length: 16}, () => ""));

        await new GameBlueprintWizard(new FakeSlotGameNameGenerating(SUGGESTION)).run(prompt);

        expect(prompt.questions[0]).toBe("Game id [blazing-riches]: ");
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
            "",
            "",
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
            "", // wilds
            "", // scatters
            "-", // availableBets
            "", // paylines
            "", // paytable A
            "", // reel weighting
            "", // outDir
        ]);

        const result = await new GameBlueprintWizard(nameGenerator).run(prompt);

        expect(result?.blueprint.manifest.id).toBe("blazing-riches");
        expect(prompt.questions.filter((q) => q.startsWith("Game id")).every((q) => q.includes("[blazing-riches]"))).toBe(
            true,
        );
        expect(nameGenerator.generateCalls).toBe(1);
    });

    it("reprompts on a non-numeric reels answer", async () => {
        const prompt = new FakePromptAdapting([
            "sample-slot",
            "",
            "",
            "not-a-number",
            "5",
            "3",
            "A",
            "",
            "",
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
            "sample-slot",
            "",
            "",
            "",
            "",
            "A,A",
            "A,K",
            "",
            "",
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
        const prompt = new FakePromptAdapting(["sample-slot", "", "", "", "", "A", "", "", "-", "", "", "", ""]);

        const result = await new GameBlueprintWizard().run(prompt);

        expect(result?.blueprint.availableBets).toBeUndefined();
    });

    it("parses custom paylines and reprompts on a wrong-length line", async () => {
        const prompt = new FakePromptAdapting([
            "sample-slot",
            "",
            "",
            "2", // reels
            "2", // rows
            "A,B",
            "", // wilds
            "", // scatters
            "-",
            "0,0,0", // wrong length for 2 reels -> reprompt
            "0,0;1,1", // valid: two paylines of length 2
            "", // paytable A -> default
            "", // paytable B -> default
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
            "sample-slot",
            "",
            "",
            "2", // reels
            "",
            "A,B",
            "", // wilds
            "", // scatters
            "-",
            "",
            "-", // paytable A -> no payout at all
            "-", // paytable B -> no payout at all
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

    it("omits both reelStrips and symbolWeights when reel weighting is skipped with \"-\" (engine default)", async () => {
        const prompt = new FakePromptAdapting(["sample-slot", "", "", "", "", "A", "", "", "-", "", "", "-", ""]);

        const result = await new GameBlueprintWizard().run(prompt);

        expect(result?.blueprint.reelStrips).toBeUndefined();
        expect(result?.blueprint.symbolWeights).toBeUndefined();
    });

    it("reprompts when a paytable matchCount exceeds the chosen reel count", async () => {
        const prompt = new FakePromptAdapting([
            "sample-slot",
            "",
            "",
            "3", // reels
            "",
            "A",
            "",
            "",
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
            "sample-slot",
            "",
            "",
            "",
            "",
            "A,B",
            "",
            "",
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
            "sample-slot",
            "",
            "",
            "2", // reels
            "",
            "A,B",
            "",
            "",
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
            "sample-slot",
            "",
            "",
            "",
            "",
            "A,B:1", // "B:1" isn't parseable later (paytable/weights use ":" as a separator) -> reprompt
            "A,B",
            "",
            "",
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

    describe("wilds/scatters (symbol roles)", () => {
        it("collects wilds and scatters, skipping a wild's own paytable question entirely", async () => {
            const prompt = new FakePromptAdapting([
                "sample-slot",
                "",
                "",
                "",
                "",
                "A,B,C", // symbols
                "B", // wilds
                "C", // scatters
                "-", // availableBets
                "", // paylines
                "3:5", // paytable A
                "3:2", // paytable C (B is wild, never asked)
                "", // reel weighting
                "-", // mechanics: skip
                "", // outDir
            ]);

            const result = await new GameBlueprintWizard().run(prompt);

            expect(result?.blueprint.wilds).toEqual(["B"]);
            expect(result?.blueprint.scatters).toEqual(["C"]);
            expect(result?.blueprint.paytable).toEqual({A: {"3": 5}, C: {"3": 2}});
            expect(prompt.questions.some((q) => q.startsWith('  "B"'))).toBe(false);
        });

        it("omits wilds/scatters on a blank Enter rather than writing out empty arrays", async () => {
            const prompt = new FakePromptAdapting(["sample-slot", "", "", "", "", "A", "", "", "-", "", "", "", ""]);

            const result = await new GameBlueprintWizard().run(prompt);

            expect(result?.blueprint.wilds).toBeUndefined();
            expect(result?.blueprint.scatters).toBeUndefined();
        });

        it("reprompts on an unknown wild symbol", async () => {
            const prompt = new FakePromptAdapting([
                "sample-slot",
                "",
                "",
                "",
                "",
                "A,B",
                "X", // unknown -> reprompt
                "A", // valid
                "",
                "-",
                "",
                "",
                "",
                "",
                "",
            ]);

            const result = await new GameBlueprintWizard().run(prompt);

            expect(result?.blueprint.wilds).toEqual(["A"]);
            expect(prompt.questions.filter((q) => q.startsWith("Wild symbols")).length).toBe(2);
        });

        it("reprompts when scatters overlap the declared wilds", async () => {
            const prompt = new FakePromptAdapting([
                "sample-slot",
                "",
                "",
                "",
                "",
                "A,B",
                "A", // wilds
                "A", // scatters attempt 1: overlaps wild -> reprompt
                "B", // scatters attempt 2: valid
                "-",
                "",
                "", // paytable B (A is wild, never asked)
                "",
                "-", // mechanics: skip
                "",
            ]);

            const result = await new GameBlueprintWizard().run(prompt);

            expect(result?.blueprint.wilds).toEqual(["A"]);
            expect(result?.blueprint.scatters).toEqual(["B"]);
            expect(prompt.questions.filter((q) => q.startsWith("Scatter symbols")).length).toBe(2);
        });

        it("reprompts on an unknown scatter symbol", async () => {
            const prompt = new FakePromptAdapting([
                "sample-slot",
                "",
                "",
                "",
                "",
                "A,B",
                "",
                "X", // unknown -> reprompt
                "B", // valid
                "-",
                "",
                "",
                "",
                "",
                "-",
                "",
            ]);

            const result = await new GameBlueprintWizard().run(prompt);

            expect(result?.blueprint.scatters).toEqual(["B"]);
        });
    });

    describe("mechanics (scatter-triggered free games)", () => {
        it("is never asked when no scatter symbol was declared", async () => {
            const prompt = new FakePromptAdapting(["sample-slot", "", "", "", "", "A", "", "", "-", "", "", "", ""]);

            const result = await new GameBlueprintWizard().run(prompt);

            expect(result?.blueprint.mechanics).toBeUndefined();
            expect(prompt.questions.some((q) => q.startsWith("Free games"))).toBe(false);
        });

        it("builds a scatter-triggered free games mechanic when a scatter is declared", async () => {
            const prompt = new FakePromptAdapting([
                "sample-slot",
                "",
                "",
                "",
                "",
                "A,B,S",
                "", // wilds -> none
                "S", // scatters
                "-",
                "",
                "3:5", // paytable A
                "3:2", // paytable B
                "3:1", // paytable S
                "", // reel weighting
                "", // mechanics scatter symbol -> default "S"
                "3:8,4:15,5:20", // mechanics awards
                "", // outDir
            ]);

            const result = await new GameBlueprintWizard().run(prompt);

            expect(result?.blueprint.mechanics).toEqual({
                freeGames: {scatterSymbol: "S", awardsByCount: {"3": 8, "4": 15, "5": 20}},
            });
        });

        it('skips the mechanic entirely when answered with "-"', async () => {
            const prompt = new FakePromptAdapting([
                "sample-slot",
                "",
                "",
                "",
                "",
                "A,S",
                "",
                "S",
                "-",
                "",
                "3:5",
                "3:1",
                "",
                "-", // mechanics: skip
                "",
            ]);

            const result = await new GameBlueprintWizard().run(prompt);

            expect(result?.blueprint.mechanics).toBeUndefined();
        });

        it("reprompts on an unknown trigger scatter", async () => {
            const prompt = new FakePromptAdapting([
                "sample-slot",
                "",
                "",
                "",
                "",
                "A,S",
                "",
                "S",
                "-",
                "",
                "3:5",
                "3:1",
                "",
                "X", // unknown scatter -> reprompt
                "S", // valid
                "3:8",
                "",
            ]);

            const result = await new GameBlueprintWizard().run(prompt);

            expect(result?.blueprint.mechanics).toEqual({freeGames: {scatterSymbol: "S", awardsByCount: {"3": 8}}});
        });

        it("reprompts on an invalid free games awards pair", async () => {
            const prompt = new FakePromptAdapting([
                "sample-slot",
                "",
                "",
                "",
                "",
                "A,S",
                "",
                "S",
                "-",
                "",
                "3:5",
                "3:1",
                "",
                "", // mechanics scatter -> default "S"
                "bogus", // invalid pair -> reprompt
                "3:8", // valid
                "",
            ]);

            const result = await new GameBlueprintWizard().run(prompt);

            expect(result?.blueprint.mechanics).toEqual({freeGames: {scatterSymbol: "S", awardsByCount: {"3": 8}}});
        });
    });

    describe("run() options (presetName/destination)", () => {
        it("pre-fills the id/name questions from a given presetName instead of minting a random suggestion", async () => {
            const nameGenerator = new FakeSlotGameNameGenerating(SUGGESTION);
            const prompt = new FakePromptAdapting(Array.from({length: 16}, () => ""));

            const result = await new GameBlueprintWizard(nameGenerator).run(prompt, {presetName: "my-cool-game"});

            expect(result?.blueprint.manifest.id).toBe("my-cool-game");
            expect(result?.blueprint.manifest.name).toBe("My Cool Game");
            expect(prompt.questions[0]).toBe("Game id [my-cool-game]: ");
            expect(nameGenerator.generateCalls).toBe(0);
        });

        it("still lets a manually typed id override a given presetName", async () => {
            const prompt = new FakePromptAdapting(["typed-id", ...Array.from({length: 15}, () => "")]);

            const result = await new GameBlueprintWizard().run(prompt, {presetName: "preset-name"});

            expect(result?.blueprint.manifest.id).toBe("typed-id");
            expect(result?.blueprint.manifest.name).toBe("Typed Id");
        });

        it("resolves the destination question to a concrete path (never undefined) when a destination option is given", async () => {
            const nameGenerator = new FakeSlotGameNameGenerating(SUGGESTION);
            const prompt = new FakePromptAdapting(Array.from({length: 16}, () => ""));

            const result = await new GameBlueprintWizard(nameGenerator).run(prompt, {
                destination: {label: "Blueprint file", defaultPathFor: (id) => `./${id}.blueprint.json`},
            });

            expect(result?.outDir).toBe("./blazing-riches.blueprint.json");
            expect(prompt.questions[prompt.questions.length - 1]).toBe("Blueprint file [./blazing-riches.blueprint.json]: ");
        });

        it("accepts a typed destination answer verbatim, overriding the shown default", async () => {
            const nameGenerator = new FakeSlotGameNameGenerating(SUGGESTION);
            const answers = Array.from({length: 15}, () => "");
            answers.push("custom/path.blueprint.json");
            const prompt = new FakePromptAdapting(answers);

            const result = await new GameBlueprintWizard(nameGenerator).run(prompt, {
                destination: {label: "Blueprint file", defaultPathFor: (id) => `./${id}.blueprint.json`},
            });

            expect(result?.outDir).toBe("custom/path.blueprint.json");
        });
    });

    // The Enter-only contract: every question has to both *show* a default and *accept* it, and the
    // blueprint that falls out has to be the canonical starter preset (modulo the generated manifest
    // and the omitted output dir) rather than a half-populated one. See
    // WizardBuildWorkflow.integration.test.ts for the same run taken all the way to a built package
    // that validates and simulates.
    describe("Enter-only run", () => {
        // id, name, version, reels, rows, symbols, wilds, scatters, availableBets, paylines,
        // paytable A/K/Q/J (one question per default symbol), reel weighting, outDir.
        const ENTER_ONLY_ANSWERS = Array.from({length: 16}, () => "");

        it("builds the canonical starter blueprint when every question is answered with Enter", async () => {
            const prompt = new FakePromptAdapting(ENTER_ONLY_ANSWERS);

            const result = await new GameBlueprintWizard(new FakeSlotGameNameGenerating(SUGGESTION)).run(prompt);

            expect(result).toEqual({
                blueprint: {
                    manifest: {id: "blazing-riches", name: "Blazing Riches", version: "0.1.0"},
                    reels: 5,
                    rows: 3,
                    symbols: ["A", "K", "Q", "J"],
                    paytable: {
                        A: {"3": 5, "4": 10, "5": 20},
                        K: {"3": 3, "4": 6, "5": 12},
                        Q: {"3": 2, "4": 4, "5": 8},
                        J: {"3": 1, "4": 2, "5": 4},
                    },
                    symbolWeights: {A: 4, K: 6, Q: 8, J: 10},
                    availableBets: [1, 2, 5],
                },
                outDir: undefined,
            });
        });

        it("takes its defaults from the injected canonical preset rather than restating them", async () => {
            const prompt = new FakePromptAdapting(Array.from({length: 14}, () => ""));

            const result = await new GameBlueprintWizard(new FakeSlotGameNameGenerating(SUGGESTION), () => ({
                manifest: {id: "other", name: "Other", version: "9.9.9"},
                reels: 3,
                rows: 2,
                symbols: ["X", "Y"],
                availableBets: [7],
                paytable: {X: {"3": 4}, Y: {"3": 2}},
                symbolWeights: {X: 1, Y: 3},
            })).run(prompt);

            expect(result?.blueprint).toMatchObject({
                reels: 3,
                rows: 2,
                symbols: ["X", "Y"],
                availableBets: [7],
                paytable: {X: {"3": 4}, Y: {"3": 2}},
                symbolWeights: {X: 1, Y: 3},
            });
            // The version default is the preset's too, not a second copy living in the wizard.
            expect(result?.blueprint.manifest.version).toBe("9.9.9");
        });

        it("displays the default it will apply on every question that has one", async () => {
            const prompt = new FakePromptAdapting(ENTER_ONLY_ANSWERS);

            await new GameBlueprintWizard(new FakeSlotGameNameGenerating(SUGGESTION)).run(prompt);

            const asked = (prefix: string): string =>
                prompt.questions.find((question) => question.trimStart().startsWith(prefix)) ?? "";

            expect(asked("Game id")).toContain("[blazing-riches]");
            expect(asked("Game name")).toContain("[Blazing Riches]");
            expect(asked("Version")).toContain("[0.1.0]");
            expect(asked("Number of reels")).toContain("[5]");
            expect(asked("Number of rows")).toContain("[3]");
            expect(asked("Symbols")).toContain("[A,K,Q,J]");
            expect(asked("Wild symbols")).toContain("Enter for none");
            expect(asked("Scatter symbols")).toContain("Enter for none");
            expect(asked("Available bets")).toContain("[1,2,5]");
            expect(asked("Paylines")).toContain("Enter for the default");
            expect(asked('"A"')).toContain("[3:5,4:10,5:20]");
            expect(asked('"J"')).toContain("[3:1,4:2,5:4]");
            expect(asked("Reel weighting")).toContain("[A:4,K:6,Q:8,J:10]");
            expect(asked("Output directory")).toContain("[./blazing-riches]");
        });

        it("applies valid default payouts for a blank paytable answer instead of leaving the symbol unpaid", async () => {
            const prompt = new FakePromptAdapting(ENTER_ONLY_ANSWERS);

            const result = await new GameBlueprintWizard(new FakeSlotGameNameGenerating(SUGGESTION)).run(prompt);

            // Every declared symbol pays — the empty-paytable blueprint the old blank answer produced
            // was rejected outright by GameBlueprintValidator ("blueprint-paytable-empty").
            expect(Object.keys(result?.blueprint.paytable ?? {})).toEqual(["A", "K", "Q", "J"]);
            for (const payouts of Object.values(result?.blueprint.paytable ?? {})) {
                expect(Object.keys(payouts).length).toBeGreaterThan(0);
            }
        });

        it("defaults reel weighting to weights covering exactly the symbols in play", async () => {
            const prompt = new FakePromptAdapting(["", "", "", "", "", "P,Q,R", "", "", "", "", "", "", "", "", ""]);

            const result = await new GameBlueprintWizard(new FakeSlotGameNameGenerating(SUGGESTION)).run(prompt);

            // "Q" is a preset symbol and keeps the preset's weight; "P"/"R" are not, so they fall back
            // to the rarest-first ladder — either way every symbol in play is weighted.
            expect(Object.keys(result?.blueprint.symbolWeights ?? {})).toEqual(["P", "Q", "R"]);
            expect(result?.blueprint.symbolWeights).toEqual({P: 4, Q: 8, R: 8});
        });

        it("derives valid default payouts for symbols and reel counts the preset knows nothing about", async () => {
            const prompt = new FakePromptAdapting(["", "", "", "3", "", "P,R", "", "", "", "", "", "", "", ""]);

            const result = await new GameBlueprintWizard(new FakeSlotGameNameGenerating(SUGGESTION)).run(prompt);

            // Match counts never exceed the chosen reel count (3), and the higher-ranked symbol pays more.
            expect(result?.blueprint.paytable).toEqual({P: {"3": 2}, R: {"3": 1}});
        });
    });

    it("resolves null when the user cancels on the very first question", async () => {
        const prompt = new FakePromptAdapting([null]);

        const result = await new GameBlueprintWizard().run(prompt);

        expect(result).toBeNull();
    });

    it("resolves null when the user cancels partway through (e.g. mid-paytable)", async () => {
        const prompt = new FakePromptAdapting([
            "sample-slot",
            "",
            "",
            "",
            "",
            "A,K",
            "",
            "",
            "-",
            "",
            "3:5,4:10,5:20", // paytable A
            null, // Ctrl+C on paytable K
        ]);

        const result = await new GameBlueprintWizard().run(prompt);

        expect(result).toBeNull();
    });
});
