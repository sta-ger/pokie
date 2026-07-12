import {MAX_STUDIO_REPLAY_ROUND} from "../../../../cli/studio/replay/StudioReplayLimits.js";
import {validateReplayRequest} from "../../../../cli/studio/replay/validateReplayRequest.js";

describe("validateReplayRequest", () => {
    it("accepts a positive integer round with no seed", () => {
        expect(validateReplayRequest({round: 42})).toEqual({round: 42});
    });

    it("accepts a positive integer round with a non-empty seed", () => {
        expect(validateReplayRequest({round: 42, seed: "demo"})).toEqual({round: 42, seed: "demo"});
    });

    it("rejects a missing round", () => {
        expect(() => validateReplayRequest({})).toThrow('"round" must be a positive integer.');
    });

    it("rejects a non-numeric round", () => {
        expect(() => validateReplayRequest({round: "42"})).toThrow('"round" must be a positive integer.');
    });

    it("rejects a non-integer round", () => {
        expect(() => validateReplayRequest({round: 4.2})).toThrow('"round" must be a positive integer.');
    });

    it("rejects a round less than 1", () => {
        expect(() => validateReplayRequest({round: 0})).toThrow('"round" must be a positive integer.');
        expect(() => validateReplayRequest({round: -5})).toThrow('"round" must be a positive integer.');
    });

    it("rejects a round above the safe Studio limit", () => {
        expect(() => validateReplayRequest({round: MAX_STUDIO_REPLAY_ROUND + 1})).toThrow(
            `"round" must not exceed ${MAX_STUDIO_REPLAY_ROUND}.`,
        );
    });

    it("accepts a round exactly at the safe Studio limit", () => {
        expect(validateReplayRequest({round: MAX_STUDIO_REPLAY_ROUND})).toEqual({round: MAX_STUDIO_REPLAY_ROUND});
    });

    it("rejects an empty seed", () => {
        expect(() => validateReplayRequest({round: 1, seed: ""})).toThrow('"seed" must be a non-empty string when given.');
    });

    it("rejects a whitespace-only seed", () => {
        expect(() => validateReplayRequest({round: 1, seed: "   "})).toThrow('"seed" must be a non-empty string when given.');
    });

    it("rejects a non-string seed", () => {
        expect(() => validateReplayRequest({round: 1, seed: 42})).toThrow('"seed" must be a non-empty string when given.');
    });
});
