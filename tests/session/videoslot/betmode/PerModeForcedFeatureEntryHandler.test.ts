import {
    BetModeDefinition,
    FreeGamesForcedFeatureEntryHandler,
    PerModeForcedFeatureEntryHandler,
    VideoSlotWithFreeGamesSession,
} from "pokie";

const buyBonus10 = new BetModeDefinition("buy-10", {stakeMultiplier: 50, forcesFeatureEntry: true});
const buyBonus20 = new BetModeDefinition("buy-20", {stakeMultiplier: 100, forcesFeatureEntry: true});

describe("PerModeForcedFeatureEntryHandler", () => {
    it("routes canForceFeatureEntry/forceFeatureEntry to the handler registered for the active mode's id", () => {
        const session = new VideoSlotWithFreeGamesSession();
        const handler = new PerModeForcedFeatureEntryHandler(
            new Map([
                ["buy-10", new FreeGamesForcedFeatureEntryHandler(10)],
                ["buy-20", new FreeGamesForcedFeatureEntryHandler(20)],
            ]),
        );

        expect(handler.canForceFeatureEntry(session, buyBonus10)).toBe(true);
        handler.forceFeatureEntry(session, buyBonus10);
        expect(session.getFreeGamesSum()).toBe(10);

        handler.forceFeatureEntry(session, buyBonus20);
        expect(session.getFreeGamesSum()).toBe(30); // 10 (buy-10) + 20 (buy-20), never confused with each other
    });

    it("reports unsupported (false) for a mode id with no registered handler, without throwing", () => {
        const session = new VideoSlotWithFreeGamesSession();
        const handler = new PerModeForcedFeatureEntryHandler(new Map([["buy-10", new FreeGamesForcedFeatureEntryHandler(10)]]));

        expect(handler.canForceFeatureEntry(session, buyBonus20)).toBe(false);
    });

    it("forceFeatureEntry is a no-op (defense in depth) for a mode id with no registered handler", () => {
        const session = new VideoSlotWithFreeGamesSession();
        const handler = new PerModeForcedFeatureEntryHandler(new Map([["buy-10", new FreeGamesForcedFeatureEntryHandler(10)]]));

        expect(() => handler.forceFeatureEntry(session, buyBonus20)).not.toThrow();
        expect(session.getFreeGamesSum()).toBe(0);
    });

    it("reports unsupported when the registered handler itself can't act on this session (e.g. no free-games support)", () => {
        const plainSessionWithoutFreeGames = {
            // A minimal stand-in with no FreeGamesStateSetting/FreeGamesStateDetermining at all.
        } as unknown as VideoSlotWithFreeGamesSession;
        const handler = new PerModeForcedFeatureEntryHandler(new Map([["buy-10", new FreeGamesForcedFeatureEntryHandler(10)]]));

        expect(handler.canForceFeatureEntry(plainSessionWithoutFreeGames, buyBonus10)).toBe(false);
    });
});
