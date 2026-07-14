import {
    applyJsonText,
    createEmptyBlueprintEditorState,
    loadBlueprintEditorState,
    withFieldUpdate,
} from "../../../cli/studio-client/blueprintEditorState.js";
import {
    setReelStripGenerationEntryType,
    setReelStripGenerationSourceMode,
    setReelStripGenerationSymbolWeight,
    type ReelStripGenerationDrafts,
} from "../../../cli/studio-client/blueprintFormOps.js";

describe("blueprintEditorState", () => {
    describe("createEmptyBlueprintEditorState", () => {
        it("returns a structurally minimal starter blueprint with matching jsonText", () => {
            const state = createEmptyBlueprintEditorState();

            expect(state.blueprint).toMatchObject({reels: 5, rows: 3, symbols: []});
            expect(JSON.parse(state.jsonText)).toEqual(state.blueprint);
            expect(state.jsonError).toBeUndefined();
        });

        it("continues the monotonic revision sequence from the given baseline instead of resetting to 0", () => {
            const state = createEmptyBlueprintEditorState(41);

            expect(state.revision).toBe(42);
        });
    });

    describe("loadBlueprintEditorState", () => {
        it("wraps the given blueprint and derives matching jsonText", () => {
            const blueprint = {manifest: {id: "a", name: "A", version: "0.1.0"}, reels: 3, rows: 3, symbols: ["A"], paytable: {}};

            const state = loadBlueprintEditorState(blueprint);

            expect(state.blueprint).toEqual(blueprint);
            expect(JSON.parse(state.jsonText)).toEqual(blueprint);
        });

        it("falls back to an empty object for a non-object value", () => {
            expect(loadBlueprintEditorState("not an object").blueprint).toEqual({});
            expect(loadBlueprintEditorState(null).blueprint).toEqual({});
            expect(loadBlueprintEditorState([1, 2]).blueprint).toEqual({});
        });

        // The regression this guards against: resetting to a fixed baseline (e.g. 0) on every New/Load
        // can coincidentally reproduce a revision number an in-flight request captured *before* that
        // New/Load happened, making a genuinely stale response look fresh again. Continuing the
        // sequence from whatever came before makes that collision impossible.
        it("never resets the revision counter -- continuing from a prior state's revision always strictly advances, however many times New/Load happens", () => {
            let state = createEmptyBlueprintEditorState();
            const seenRevisions = new Set<number>([state.revision]);

            for (let i = 0; i < 5; i++) {
                const previousRevision = state.revision;
                state = loadBlueprintEditorState({manifest: {id: `a${i}`}}, previousRevision);
                expect(state.revision).toBeGreaterThan(previousRevision);
                expect(seenRevisions.has(state.revision)).toBe(false);
                seenRevisions.add(state.revision);
            }
        });

        it("a revision captured before New/Load is detected as stale even though the counter keeps climbing (never revisits 0)", () => {
            const initial = createEmptyBlueprintEditorState();
            const capturedRevision = initial.revision;

            const afterNew = createEmptyBlueprintEditorState(initial.revision);
            const afterLoad = loadBlueprintEditorState({manifest: {id: "a"}}, afterNew.revision);

            expect(afterLoad.revision).not.toBe(capturedRevision);
        });
    });

    describe("applyJsonText", () => {
        it("replaces the blueprint on valid JSON object text and clears jsonError", () => {
            const state = createEmptyBlueprintEditorState();
            const nextText = JSON.stringify({manifest: {id: "b"}, reels: 3});

            const next = applyJsonText(state, nextText);

            expect(next.blueprint).toEqual({manifest: {id: "b"}, reels: 3});
            expect(next.jsonText).toBe(nextText);
            expect(next.jsonError).toBeUndefined();
        });

        it("keeps the last-known-good blueprint and sets jsonError on malformed JSON", () => {
            const state = createEmptyBlueprintEditorState();

            const next = applyJsonText(state, "{not valid json");

            expect(next.blueprint).toEqual(state.blueprint);
            expect(next.jsonText).toBe("{not valid json");
            expect(next.jsonError).toBeDefined();
        });

        it("keeps the last-known-good blueprint and sets jsonError when the JSON isn't an object", () => {
            const state = createEmptyBlueprintEditorState();

            const next = applyJsonText(state, "[1, 2, 3]");

            expect(next.blueprint).toEqual(state.blueprint);
            expect(next.jsonError).toBe("The blueprint must be a JSON object.");
        });

        it("increments revision on a successful apply, but not on a failed one", () => {
            const state = createEmptyBlueprintEditorState();

            const failed = applyJsonText(state, "{not valid json");
            expect(failed.revision).toBe(state.revision);

            const succeeded = applyJsonText(state, JSON.stringify({manifest: {id: "b"}}));
            expect(succeeded.revision).toBe(state.revision + 1);
        });
    });

    describe("withFieldUpdate", () => {
        it("applies the mutation to a clone and re-derives jsonText", () => {
            const state = createEmptyBlueprintEditorState();

            const next = withFieldUpdate(state, (b) => {
                b.reels = 7;
            });

            expect(next.blueprint.reels).toBe(7);
            expect(state.blueprint.reels).toBe(5);
            expect(JSON.parse(next.jsonText)).toEqual(next.blueprint);
        });

        it("preserves unknown top-level fields across a Form edit", () => {
            const state = loadBlueprintEditorState({manifest: {id: "a"}, reels: 3, futureField: "kept"});

            const next = withFieldUpdate(state, (b) => {
                b.reels = 5;
            });

            expect(next.blueprint.futureField).toBe("kept");
            expect(next.blueprint.reels).toBe(5);
        });

        it("clears any pending jsonError", () => {
            const state = applyJsonText(createEmptyBlueprintEditorState(), "{not valid json");
            expect(state.jsonError).toBeDefined();

            const next = withFieldUpdate(state, (b) => {
                b.reels = 5;
            });

            expect(next.jsonError).toBeUndefined();
        });

        it("increments revision on every edit", () => {
            const state = createEmptyBlueprintEditorState();

            const next = withFieldUpdate(state, (b) => {
                b.reels = 7;
            });

            expect(next.revision).toBe(state.revision + 1);
        });

        // Reel Strip Modeler drafts (literal<->generated, symbolCounts<->symbolWeights) live entirely
        // outside BlueprintEditorState (see blueprintFormOps.ts's ReelStripGenerationDraft) -- this
        // proves that guarantee end to end, through the exact same withFieldUpdate pipeline that
        // derives jsonText (what Save actually writes) and feeds Validate/Preview/Build.
        it("keeps jsonText a clean canonical GameBlueprint -- no UI draft fields survive a literal<->generated and counts<->weights round trip", () => {
            let state = loadBlueprintEditorState({
                manifest: {id: "a", name: "A", version: "0.1.0"},
                reels: 1,
                rows: 3,
                symbols: ["A", "B"],
                paytable: {},
                reelStripGeneration: [{type: "generated", length: 2, seed: 1, symbolCounts: {A: 1, B: 1}}],
            });
            const drafts: ReelStripGenerationDrafts = new Map();

            state = withFieldUpdate(state, (b) => setReelStripGenerationSourceMode(b, drafts, 0, "symbolWeights"));
            state = withFieldUpdate(state, (b) => setReelStripGenerationSymbolWeight(b, 0, "A", 5));
            state = withFieldUpdate(state, (b) => setReelStripGenerationEntryType(b, drafts, 0, "literal"));
            state = withFieldUpdate(state, (b) => setReelStripGenerationEntryType(b, drafts, 0, "generated"));

            expect(state.jsonText).not.toMatch(/draft/i);
            const entry = (state.blueprint.reelStripGeneration as Record<string, unknown>[])[0];
            expect(Object.keys(entry).sort()).toEqual(["length", "seed", "symbolWeights", "type"]);
        });
    });
});
