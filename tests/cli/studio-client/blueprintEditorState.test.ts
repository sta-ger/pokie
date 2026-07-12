import {
    applyJsonText,
    createEmptyBlueprintEditorState,
    loadBlueprintEditorState,
    withFieldUpdate,
} from "../../../cli/studio-client/blueprintEditorState.js";

describe("blueprintEditorState", () => {
    describe("createEmptyBlueprintEditorState", () => {
        it("returns a structurally minimal starter blueprint with matching jsonText", () => {
            const state = createEmptyBlueprintEditorState();

            expect(state.blueprint).toMatchObject({reels: 5, rows: 3, symbols: []});
            expect(JSON.parse(state.jsonText)).toEqual(state.blueprint);
            expect(state.jsonError).toBeUndefined();
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
    });
});
