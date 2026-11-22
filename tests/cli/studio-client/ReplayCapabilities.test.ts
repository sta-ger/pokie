import {describeReplayCapabilities, describeReplayEntryLabel} from "../../../cli/studio-client/src/domain/interpret/Replay.js";

describe("Replay capabilities", () => {
    it("describes an audit recording as an exact command replay, not a seeded forward replay", () => {
        const capabilities = describeReplayCapabilities({
            source: "artifact",
            hasResult: true,
            reproducibility: {status: "ready"},
            auditRecording: true,
            hasComparisonTarget: true,
            canExport: true,
        });

        expect(capabilities.reproducible.status).toBe("available");
        expect(capabilities.reproducible.reason).toContain("recorded audit commands");
        expect(capabilities.reproducible.reason).not.toContain("recorded seed");
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

    it("keeps the seeded-forward-replay wording for an ordinary round record", () => {
        const capabilities = describeReplayCapabilities({
            source: "artifact",
            hasResult: true,
            reproducibility: {status: "ready"},
            hasComparisonTarget: true,
            canExport: true,
        });

        expect(capabilities.reproducible.status).toBe("available");
        expect(capabilities.reproducible.reason).toContain("recorded seed");
    });
});
