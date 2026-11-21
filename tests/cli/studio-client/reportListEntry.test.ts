import {describeReportListEntry} from "../../../cli/studio-client/src/domain/interpret/Reports.js";
import type {StudioSimulationReportListEntry} from "../../../cli/studio-client/src/api/types.js";

function entry(overrides: Partial<StudioSimulationReportListEntry> = {}): StudioSimulationReportListEntry {
    return {
        id: "report-1",
        status: "completed",
        game: {id: "starter-slot", version: "0.1.0"},
        requestedRounds: 10_000,
        workers: 1,
        startedAt: "2026-11-21T18:00:00.000Z",
        completedAt: "2026-11-21T18:00:10.000Z",
        durationMs: 10_000,
        hasWarnings: false,
        ...overrides,
    };
}

describe("describeReportListEntry", () => {
    it("shows the round count and seed that distinguish otherwise similar runs", () => {
        const label = describeReportListEntry(entry({actualRounds: 100_000, seed: "valera-1"}));
        expect(label).toContain("starter-slot v0.1.0");
        expect(label).toContain("100000 rounds");
        expect(label).toContain("seed valera-1");
    });

    it("makes a missing seed explicit", () => {
        expect(describeReportListEntry(entry({seed: "  "}))).toContain("seed no seed");
    });

    it("includes the mode when the report has one", () => {
        expect(describeReportListEntry(entry({modeName: "base"}))).toContain("mode base");
    });
});
