import {describeReplayCapabilities, describeReplayEntryLabel, describeReplayReproducibility} from "../../../cli/studio-client/src/domain/interpret/Replay.js";

describe("Replay capabilities", () => {
    it("separates an exact audit replay from a seeded forward replay", () => {
        const capabilities = describeReplayCapabilities({
            source: "artifact",
            hasResult: true,
            reproducibility: {status: "ready"},
            auditRecording: true,
            hasComparisonTarget: true,
            canExport: true,
        });

        expect(capabilities.auditReplay.status).toBe("available");
        expect(capabilities.auditReplay.reason).toContain("recorded audit commands");
        expect(capabilities.auditReplay.reason).not.toContain("recorded seed");
        expect(capabilities.seedReplay.status).toBe("unavailable");
        expect(capabilities.seedReplay.reason).toContain("No seed was recorded");
    });

    it("does not claim source, seed or mode were 'not recorded' in a compact list label", () => {
        const label = describeReplayEntryLabel({
            id: "replay-1",
            status: "completed",
            game: {id: "starter-slot", name: "Starter Slot", version: "0.1.0"},
            round: 1,
            completedRounds: 1,
            startedAt: "2026-11-22T18:38:29.206Z",
            durationMs: 1000,
        });

        expect(label).toContain("starter-slot round 1 — Reproduced");
        expect(label).not.toContain("Source not recorded");
        expect(label).not.toContain("Seed not recorded");
        expect(label).not.toContain("Mode not recorded");
    });

    it("keeps the seeded-forward-replay wording for an ordinary round record with a seed", () => {
        const capabilities = describeReplayCapabilities({
            source: "artifact",
            hasResult: true,
            reproducibility: {status: "ready"},
            seed: "demo",
            hasComparisonTarget: true,
            canExport: true,
        });

        expect(capabilities.auditReplay.status).toBe("unavailable");
        expect(capabilities.auditReplay.reason).toContain("No captured audit commands");
        expect(capabilities.seedReplay.status).toBe("available");
        expect(capabilities.seedReplay.reason).toContain("recorded seed");
    });

    it("treats a null seed as absent instead of crashing in the inspect/replay path", () => {
        const entry = {
            id: "replay-1",
            status: "completed" as const,
            game: {id: "starter-slot", name: "Starter Slot", version: "0.1.0"},
            round: 1,
            completedRounds: 1,
            startedAt: "2026-11-22T18:38:29.206Z",
            durationMs: 1000,
            seed: null,
            modeName: null,
        };

        expect(() => describeReplayEntryLabel(entry)).not.toThrow();
        expect(describeReplayEntryLabel(entry)).not.toContain("Seed null");
        expect(describeReplayReproducibility({seed: null}, {id: "starter-slot", version: "0.1.0"})).toMatchObject({
            status: "blocked",
        });

        const capabilities = describeReplayCapabilities({
            source: "artifact",
            hasResult: true,
            seed: null,
            hasComparisonTarget: true,
            canExport: true,
        });
        expect(capabilities.seedReplay.status).toBe("unavailable");
        expect(capabilities.seedReplay.reason).toContain("No seed was recorded");
    });
});
