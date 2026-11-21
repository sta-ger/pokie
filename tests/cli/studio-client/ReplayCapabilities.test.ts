import {describeReplayCapabilities} from "../../../cli/studio-client/src/domain/interpret/Replay.js";

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
