import type {StudioRuntimeSessionView} from "../../../cli/studio-client/src/api/types.js";
import {describeRuntimeSessionScreen} from "../../../cli/studio-client/src/domain/interpret/Runtime.js";

function session(overrides: Record<string, unknown>): StudioRuntimeSessionView {
    return {
        sessionId: "session-1",
        game: {id: "game", name: "Game", version: "0.1.0"},
        ...overrides,
    } as StudioRuntimeSessionView;
}

describe("describeRuntimeSessionScreen", () => {
    it("prefers the canonical public screen", () => {
        expect(describeRuntimeSessionScreen(session({
            screen: [["A", "K"], ["Q", "J"]],
            reelsSymbols: [["ignored", "grid"]],
        }))).toEqual([["A", "K"], ["Q", "J"]]);
    });

    it("falls back to a serializer's initial reelsSymbols payload", () => {
        expect(describeRuntimeSessionScreen(session({
            reelsSymbols: [["A", "K"], ["Q", "J"]],
        }))).toEqual([["A", "K"], ["Q", "J"]]);
    });

    it("returns undefined instead of inventing a screen", () => {
        expect(describeRuntimeSessionScreen(session({}))).toBeUndefined();
        expect(describeRuntimeSessionScreen(session({reelsSymbols: "not-a-grid"}))).toBeUndefined();
        expect(describeRuntimeSessionScreen(session({reelsSymbols: [["A"], "not-a-reel"]}))).toBeUndefined();
    });
});
