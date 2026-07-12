import {HtmlSimulationReportRenderer, MarkdownSimulationReportRenderer, SimulationReport, SimulationReportRendering} from "pokie";

export type ReportDownloadFormat = "json" | "markdown" | "html";

export type SimulationReportDownload = {
    contentType: string;
    filename: string;
    body: string;
};

const EXTENSIONS: Record<ReportDownloadFormat, string> = {json: "json", markdown: "md", html: "html"};

const CONTENT_TYPES: Record<ReportDownloadFormat, string> = {
    json: "application/json; charset=utf-8",
    markdown: "text/markdown; charset=utf-8",
    html: "text/html; charset=utf-8",
};

// The exact same renderers `pokie report` uses — Studio never reimplements Markdown/HTML formatting,
// and never spawns `pokie report` as a subprocess. `json` has no renderer of its own; it's the report
// exactly as SimulationReportBuilder produced it, pretty-printed the same way `pokie sim --out` writes it.
const RENDERERS: Record<"markdown" | "html", SimulationReportRendering> = {
    markdown: new MarkdownSimulationReportRenderer(),
    html: new HtmlSimulationReportRenderer(),
};

export function isReportDownloadFormat(value: unknown): value is ReportDownloadFormat {
    return value === "json" || value === "markdown" || value === "html";
}

export function buildSimulationReportDownload(
    report: SimulationReport,
    simulationId: string,
    format: ReportDownloadFormat,
): SimulationReportDownload {
    const body = format === "json" ? JSON.stringify(report, null, 4) : RENDERERS[format].render(report);
    return {
        contentType: CONTENT_TYPES[format],
        filename: buildReportFilename(report.game.id, report.game.version, simulationId, EXTENSIONS[format]),
        body,
    };
}

// Safe by construction: strips anything other than alphanumerics/dot/dash/underscore from each part
// before joining them, so a game id/version containing spaces, slashes, or other
// filesystem/header-unsafe characters can never produce a malformed or path-escaping filename.
function buildReportFilename(gameId: string, gameVersion: string, simulationId: string, extension: string): string {
    const sanitize = (value: string): string => value.replace(/[^a-zA-Z0-9._-]+/g, "-");
    return `${sanitize(gameId)}-${sanitize(gameVersion)}-${sanitize(simulationId)}.${extension}`;
}
