import {analyticsEnvelope, emptyFeatureAnalytics, featureAnalyticsStatistics} from "../../../../src/simulation/FeatureAnalytics.js";
import type {SimulationReport} from "@fromstan/pokie";
import {
    buildSimulationReportDownload,
    isReportDownloadFormat,
} from "../../../../cli/studio/simulation/buildSimulationReportDownload.js";

function createReport(overrides: Partial<SimulationReport> = {}): SimulationReport {
    return {
        game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
        requestedRounds: 1000,
        rounds: 1000,
        seed: "demo",
        totalBet: 1000,
        totalWin: 950,
        rtp: 0.95,
        hitFrequency: 0.25,
        maxWin: 120,
        durationMs: 500,
        spinsPerSecond: 2000,
        ...overrides,
    };
}

describe("isReportDownloadFormat", () => {
    it("accepts json/markdown/html", () => {
        expect(isReportDownloadFormat("json")).toBe(true);
        expect(isReportDownloadFormat("markdown")).toBe(true);
        expect(isReportDownloadFormat("html")).toBe(true);
    });

    it("rejects anything else", () => {
        expect(isReportDownloadFormat("csv")).toBe(false);
        expect(isReportDownloadFormat(null)).toBe(false);
        expect(isReportDownloadFormat(undefined)).toBe(false);
        expect(isReportDownloadFormat(1)).toBe(false);
    });
});

describe("buildSimulationReportDownload", () => {
    it("produces a parseable, pretty-printed JSON body with the right content type/filename", () => {
        const report = createReport();

        const download = buildSimulationReportDownload(report, "job-1", "json");

        expect(download.contentType).toBe("application/json; charset=utf-8");
        expect(download.filename).toBe("sample-slot-0.1.0-job-1.json");
        expect(JSON.parse(download.body)).toEqual(report);
        expect(download.body).toContain("\n");
        // pretty-printed, not a single line
    });

    it("produces a Markdown body containing the key metrics", () => {
        const report = createReport();

        const download = buildSimulationReportDownload(report, "job-1", "markdown");

        expect(download.contentType).toBe("text/markdown; charset=utf-8");
        expect(download.filename).toBe("sample-slot-0.1.0-job-1.md");
        expect(download.body).toContain("# Simulation Report: Sample Slot");
        expect(download.body).toContain("RTP");
        expect(download.body).toContain("95.00%");
    });

    it("produces a full HTML document", () => {
        const report = createReport();

        const download = buildSimulationReportDownload(report, "job-1", "html");

        expect(download.contentType).toBe("text/html; charset=utf-8");
        expect(download.filename).toBe("sample-slot-0.1.0-job-1.html");
        expect(download.body).toContain("<!DOCTYPE html>");
        expect(download.body).toContain("<html");
        expect(download.body).toContain("</html>");
        expect(download.body).toContain("Sample Slot");
    });

    it("sanitizes unsafe characters out of the filename", () => {
        const report = createReport({game: {id: "sample slot/2", name: "Sample Slot", version: "0.1.0+build"}});

        const download = buildSimulationReportDownload(report, "job/1 two", "json");

        expect(download.filename).toBe("sample-slot-2-0.1.0-build-job-1-two.json");
    });

    it("renders an old report shape (missing breakdown/warnings/recommendations/reproducibility) without throwing", () => {
        const report = createReport();
        // already has none of these optional fields

        expect(() => buildSimulationReportDownload(report, "job-1", "markdown")).not.toThrow();
        expect(() => buildSimulationReportDownload(report, "job-1", "html")).not.toThrow();
        expect(() => buildSimulationReportDownload(report, "job-1", "json")).not.toThrow();
    });
});

it("retains sequence denominators, zero coverage and exact underflow ratios in every downloadable format", () => {
    const report = createReport();
    report.reelSequences = [{reelIndex: 0, context: "logical-round", model: "defined", selections: 0, variants: [
        {id: "tiny", weight: Number.MIN_VALUE, probability: 0, probabilityRatio: {numerator: "1", denominator: "123456789012345678901234567890"}, count: 0, frequency: 0, uncovered: true},
        {id: "zero", weight: 0, probability: 0, count: 0, frequency: 0, uncovered: false},
    ]}];
    expect(JSON.parse(buildSimulationReportDownload(report, "weighted", "json").body).reelSequences).toEqual(report.reelSequences);
    for (const format of ["markdown", "html"] as const) {
        const rendered = buildSimulationReportDownload(report, "weighted", format).body;
        expect(rendered).toContain("0 selections");
        expect(rendered).toContain("1/123456789012345678901234567890");
        expect(rendered).toContain("zero weight");
        expect(rendered).toContain("uncovered");
        expect(rendered).not.toContain("NaN");
    }
});

it("retains analytics schema, identity and denominators in every durable download format", () => {
    const analytics = featureAnalyticsStatistics(emptyFeatureAnalytics(analyticsEnvelope("saved-model", true, true)));
    const report = createReport({analytics});
    const json = buildSimulationReportDownload(report, "analytics", "json");
    expect(JSON.parse(json.body).analytics).toEqual(analytics);
    for (const format of ["markdown", "html"] as const) {
        const download = buildSimulationReportDownload(report, "analytics", format);
        expect(download.body).toContain("saved-model");
        expect(download.body).toContain("entries / logical entries: 0 / 0 = 0");
        expect(download.body).toContain("bonus win / completions: 0 / 0 = 0");
    }
});
