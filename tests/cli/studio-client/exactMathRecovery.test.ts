import {isSupersededExactOutcomeLibraryJob} from "../../../cli/studio-client/src/domain/exactMathRecovery.js";
import type {StudioJobView} from "../../../cli/studio-client/src/api/types.js";

function job(overrides: Partial<StudioJobView> = {}): StudioJobView {
    return {
        id: "job",
        projectId: "/home/me/POKIE Projects/game/blueprint.json",
        operation: "outcome-library-generation",
        request: {generation: "exact", destination: "/home/me/POKIE Projects/game/outcomelibrary"},
        conflictKey: "outcome-library:job",
        status: "recovery-required",
        createdAt: 1,
        ...overrides,
    };
}

describe("exact-table recovery receipts", () => {
    const root = "/home/me/POKIE Projects/game/blueprint.json";

    it("recognises an interrupted default-destination run as superseded by the current table", () => {
        expect(isSupersededExactOutcomeLibraryJob(job(), root, "outcomelibrary")).toBe(true);
    });

    it("keeps an interrupted custom-destination run even when the default table is current", () => {
        const custom = job({request: {generation: "exact", destination: "/home/me/exports/custom-library"}});
        expect(isSupersededExactOutcomeLibraryJob(custom, root, "outcomelibrary")).toBe(false);
    });

    it("recognises a per-game sibling library selected by the current exact view", () => {
        const sibling = job({request: {generation: "exact", destination: "/home/me/POKIE Projects/game/game-outcomelibrary"}});
        expect(isSupersededExactOutcomeLibraryJob(sibling, root, "game-outcomelibrary")).toBe(true);
    });

    it("never treats a completed job as a stale receipt", () => {
        expect(isSupersededExactOutcomeLibraryJob(job({status: "completed"}), root, "outcomelibrary")).toBe(false);
    });

    it("keeps a sampled or differently scoped job even when the default exact table is current", () => {
        const sampled = job({request: {generation: "sampled", sample: {sampleSize: "1000", seed: "s"}, destination: "/home/me/POKIE Projects/game/outcomelibrary"}});
        const otherMode = job({request: {generation: "exact", mode: "ante", destination: "/home/me/POKIE Projects/game/outcomelibrary"}});
        expect(isSupersededExactOutcomeLibraryJob(sampled, root, "outcomelibrary", "base")).toBe(false);
        expect(isSupersededExactOutcomeLibraryJob(otherMode, root, "outcomelibrary", "base")).toBe(false);
        expect(isSupersededExactOutcomeLibraryJob(otherMode, root, "outcomelibrary", "ante")).toBe(true);
    });

    it("treats a legacy receipt without a destination as the default destination", () => {
        expect(isSupersededExactOutcomeLibraryJob(job({request: {generation: "exact"}}), root, "outcomelibrary")).toBe(true);
    });

    it("handles a package directory project root and Windows separators", () => {
        const packageRoot = "C:\\work\\game";
        const custom = job({request: {generation: "exact", destination: "C:\\work\\game\\outcomelibrary\\"}});
        expect(isSupersededExactOutcomeLibraryJob(custom, packageRoot, "outcomelibrary")).toBe(true);
    });
});
