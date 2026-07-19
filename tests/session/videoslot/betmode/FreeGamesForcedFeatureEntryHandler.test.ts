import {FreeGamesForcedFeatureEntryHandler, VideoSlotSession, VideoSlotWithFreeGamesSession} from "pokie";

describe("FreeGamesForcedFeatureEntryHandler", () => {
    it("rejects a non-positive-integer freeGamesToGrant", () => {
        expect(() => new FreeGamesForcedFeatureEntryHandler(0)).toThrow(/freeGamesToGrant/);
        expect(() => new FreeGamesForcedFeatureEntryHandler(-3)).toThrow(/freeGamesToGrant/);
        expect(() => new FreeGamesForcedFeatureEntryHandler(2.5)).toThrow(/freeGamesToGrant/);
    });

    it("extends an in-progress free-games round's sum rather than replacing it", () => {
        const session = new VideoSlotWithFreeGamesSession();
        session.setFreeGamesSum(3);
        session.setFreeGamesNum(1);

        new FreeGamesForcedFeatureEntryHandler(5).forceFeatureEntry(session);

        expect(session.getFreeGamesSum()).toBe(8);
        expect(session.getFreeGamesNum()).toBe(1);
    });

    it("grants free games on a fresh session with no round in progress", () => {
        const session = new VideoSlotWithFreeGamesSession();

        new FreeGamesForcedFeatureEntryHandler(5).forceFeatureEntry(session);

        expect(session.getFreeGamesSum()).toBe(5);
        expect(session.getFreeGamesNum()).toBe(0);
    });

    it("is a no-op against a session without free-games state", () => {
        const session = new VideoSlotSession();

        expect(() => new FreeGamesForcedFeatureEntryHandler(5).forceFeatureEntry(session)).not.toThrow();
    });
});
