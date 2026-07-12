import type {SimulationReport} from "pokie";
import {
    buildSimulationReportDownload,
    isReportDownloadFormat,
} from "../../../../cli/studio/simulation/buildSimulationReportDownload.js";

function createReport(overrides: Partial<SimulationReport> = {}): SimulationReport {
    return {
        game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
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
        expect(download.filename).toBe("crazy-fruits-0.1.0-job-1.json");
        expect(JSON.parse(download.body)).toEqual(report);
        expect(download.body).toContain("\n"); // pretty-printed, not a single line
    });

    it("produces a Markdown body containing the key metrics", () => {
        const report = createReport();

        const download = buildSimulationReportDownload(report, "job-1", "markdown");

        expect(download.contentType).toBe("text/markdown; charset=utf-8");
        expect(download.filename).toBe("crazy-fruits-0.1.0-job-1.md");
        expect(download.body).toContain("# Simulation Report: Crazy Fruits");
        expect(download.body).toContain("RTP");
        expect(download.body).toContain("95.00%");
    });

    it("produces a full HTML document", () => {
        const report = createReport();

        const download = buildSimulationReportDownload(report, "job-1", "html");

        expect(download.contentType).toBe("text/html; charset=utf-8");
        expect(download.filename).toBe("crazy-fruits-0.1.0-job-1.html");
        expect(download.body).toContain("<!DOCTYPE html>");
        expect(download.body).toContain("<html");
        expect(download.body).toContain("</html>");
        expect(download.body).toContain("Crazy Fruits");
    });

    it("sanitizes unsafe characters out of the filename", () => {
        const report = createReport({game: {id: "crazy fruits/2", name: "Crazy Fruits", version: "0.1.0+build"}});

        const download = buildSimulationReportDownload(report, "job/1 two", "json");

        expect(download.filename).toBe("crazy-fruits-2-0.1.0-build-job-1-two.json");
    });

    it("renders an old report shape (missing breakdown/warnings/recommendations/reproducibility) without throwing", () => {
        const report = createReport(); // already has none of these optional fields

        expect(() => buildSimulationReportDownload(report, "job-1", "markdown")).not.toThrow();
        expect(() => buildSimulationReportDownload(report, "job-1", "html")).not.toThrow();
        expect(() => buildSimulationReportDownload(report, "job-1", "json")).not.toThrow();
    });
});
