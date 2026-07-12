import {describeReportsList} from "../../../cli/studio-client/interpretReports.js";
import type {StudioSimulationReportListEntry} from "../../../cli/studio-client/types.js";

function createEntry(overrides: Partial<StudioSimulationReportListEntry> = {}): StudioSimulationReportListEntry {
    return {
        id: "job-1",
        status: "completed",
        game: {id: "crazy-fruits", version: "0.1.0"},
        requestedRounds: 1000,
        actualRounds: 1000,
        rtp: 0.95,
        hitFrequency: 0.25,
        maxWin: 120,
        startedAt: "2026-01-01T00:00:00.000Z",
        completedAt: "2026-01-01T00:00:01.000Z",
        durationMs: 1000,
        hasWarnings: false,
        ...overrides,
    };
}

describe("describeReportsList", () => {
    it("reports empty for no entries", () => {
        expect(describeReportsList([])).toEqual({status: "empty"});
    });

    it("wraps a non-empty list as loaded, unchanged", () => {
        const entries = [createEntry({id: "job-1"}), createEntry({id: "job-2"})];

        expect(describeReportsList(entries)).toEqual({status: "loaded", entries});
    });
});
