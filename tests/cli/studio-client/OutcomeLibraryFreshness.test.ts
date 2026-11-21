import {describeOutcomeLibraryFreshness} from "../../../cli/studio-client/src/domain/interpret/ExportDeployTargets.js";
import type {StudioOutcomeLibraryRegistryView} from "../../../cli/studio-client/src/api/types.js";

const game = {id: "starter-slot", name: "Starter Slot", version: "0.1.0"};

function registry(buildStatus: "compatible" | "stale" | "wrong"): StudioOutcomeLibraryRegistryView {
    return {
        status: "ok",
        libraryDir: "outcomelibrary",
        buildStatus,
        game,
        currentGame: game,
        recordPokieVersion: "2.0.0",
        currentPokieVersion: "2.0.0",
        generatedAt: "2026-11-21T18:00:00.000Z",
        modes: [{
            modeName: "base",
            libraryId: "starter-slot-base",
            libraryDir: "outcomelibrary",
            buildStatus,
            outcomeCount: 3125,
            totalWeight: 3125,
            rtp: 0.96768,
            hash: "sha256:library",
        }],
    };
}

describe("describeOutcomeLibraryFreshness", () => {
    it("marks a completed generation as current only when its exact mode is compatible", () => {
        expect(describeOutcomeLibraryFreshness({libraryDir: "outcomelibrary", modeName: "base"}, registry("compatible"))).toEqual({status: "current"});
    });

    it("marks a stale design as stale and explains why", () => {
        const freshness = describeOutcomeLibraryFreshness({libraryDir: "outcomelibrary", modeName: "base"}, registry("stale"));
        expect(freshness.status).toBe("stale");
        expect(freshness.reason).toMatch(/earlier saved design/);
    });

    it("distinguishes a library that belongs to another game", () => {
        const freshness = describeOutcomeLibraryFreshness({libraryDir: "outcomelibrary", modeName: "base"}, registry("wrong"));
        expect(freshness.status).toBe("wrong");
        expect(freshness.reason).toMatch(/different game/);
    });

    it("never claims freshness without a matching registry entry", () => {
        expect(describeOutcomeLibraryFreshness(undefined, registry("compatible"))).toEqual({status: "unknown"});
        expect(describeOutcomeLibraryFreshness({libraryDir: "other", modeName: "base"}, registry("compatible"))).toEqual({status: "unknown"});
        expect(describeOutcomeLibraryFreshness({libraryDir: "outcomelibrary", modeName: "base"}, undefined)).toEqual({status: "unknown"});
    });
});
