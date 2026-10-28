import {JSDOM} from "jsdom";
import {readFileSync} from "node:fs";
import path from "node:path";
import postcss from "postcss";
import {buildSimulationReportDownload} from "../../cli/studio/simulation/buildSimulationReportDownload.js";
import {describeSimulationReport} from "../../cli/studio-client/src/domain/interpret/Simulation.js";
import {formatConfidenceInterval} from "../../cli/studio-client/src/domain/interpret/formatConfidenceInterval.js";
import {featureAnalyticsReport} from "./fixtures/FeatureAnalyticsFixture.js";

// Source-aware V36-S1 regression. Independent first contact and fresh installed
// rechecks are controller-owned; this does not establish visual acceptance.
describe("V2C-36 report confidence interval units", () => {
    it.each([
        [{low: 0.9, high: 1.1}, "0.90 – 1.10"],
        [{low: 0.05, high: 7.5}, "0.05 – 7.50"],
        [{low: 0, high: 0}, "0.00 – 0.00"],
    ] as const)("agrees with the production HTML download for payout bounds %j", (interval, expected) => {
        const report = {...featureAnalyticsReport(), averagePayoutConfidenceInterval95: interval,
            rtpConfidenceInterval95: {low: 0.91, high: 0.99}};
        const original = JSON.stringify(report);
        // The canonical report wins over old, job-side statistics; formatting is
        // presentation only and must not recompute or mutate these values.
        const view = describeSimulationReport(report, {volatility: 0, payoutStandardDeviation: 0, returnStandardDeviation: 0,
            averagePayoutConfidenceInterval95: {low: 50, high: 60}, rtpConfidenceInterval95: {low: 5, high: 6}});
        const dom = new JSDOM(buildSimulationReportDownload(report, "valera36", "html").body);
        try {
            const rows = Array.from(dom.window.document.querySelectorAll("tr"));
            const cell = (label: string) => rows.find(row => row.cells[0]?.textContent === label)?.cells[1]?.textContent;
            expect(cell("Average payout 95% confidence interval")).toBe(expected);
            expect(formatConfidenceInterval(view.averagePayoutConfidenceInterval95, "payout")).toBe(expected);
            expect(cell("RTP 95% confidence interval")).toBe("91.00% – 99.00%");
            expect(formatConfidenceInterval(view.rtpConfidenceInterval95)).toBe("91.00% – 99.00%");
            expect(JSON.parse(buildSimulationReportDownload(report, "valera36", "json").body)).toEqual(report);
            expect(JSON.stringify(report)).toBe(original);
        } finally {
            dom.window.close();
        }
    });

    it("distinguishes unavailable intervals from measured zero and retains legacy job-side bounds", () => {
        const report = {...featureAnalyticsReport(), averagePayoutConfidenceInterval95: undefined,
            rtpConfidenceInterval95: undefined};
        const absent = describeSimulationReport(report);
        expect(formatConfidenceInterval(absent.averagePayoutConfidenceInterval95, "payout")).toBe("—");
        expect(formatConfidenceInterval(absent.rtpConfidenceInterval95)).toBe("—");
        const legacy = describeSimulationReport(report, {
            volatility: 0, payoutStandardDeviation: 0, returnStandardDeviation: 0,
            averagePayoutConfidenceInterval95: {low: 0, high: 0},
            rtpConfidenceInterval95: {low: 0, high: 0},
        });
        expect(formatConfidenceInterval(legacy.averagePayoutConfidenceInterval95, "payout")).toBe("0.00 – 0.00");
        expect(formatConfidenceInterval(legacy.rtpConfidenceInterval95)).toBe("0.00% – 0.00%");
    });
});

describe("V2C-36 tablet review layout contract", () => {
    const css = postcss.parse(readFileSync(path.resolve("cli/studio-client/src/global.css"), "utf8"));
    const declarations = (selector: string, width: number): Record<string, string> => {
        const values: Record<string, string> = {};
        css.walkRules(selector, rule => {
            const parent = rule.parent;
            if (parent?.type === "atrule" && parent.name === "media") {
                const maximum = parent.params.match(/^\(max-width: ([\d.]+)em\)$/);
                if (!maximum || width > Number(maximum[1]) * 16) return;
            }
            rule.walkDecls(declaration => {
                values[declaration.prop] = declaration.value;
            });
        });
        return values;
    };

    it.each([390, 800, 991, 992, 1440])("reclaims the rail space below 992px and keeps ordered step tracks at %ipx", width => {
        const main = declarations("#root .studio-app-main", width);
        expect(main["--app-shell-navbar-offset"]).toBe(width < 992 ? "0px" : undefined);
        expect(main["padding-inline"]).toBe(width < 992 ? "var(--mantine-spacing-md)" : undefined);
        const steps = declarations(".studio-simulation-stepper .mantine-Stepper-steps", width);
        expect(steps.display).toBe("grid");
        expect(steps["grid-template-columns"]).toBe(`repeat(${width <= 576 ? 2 : 4}, minmax(0, 1fr))`);
    });

    it("uses the public masthead and cream workspace without changing semantic status colours", () => {
        expect(declarations(".studio-app-masthead", 800)).toMatchObject({
            background: "#172d3b", color: "#fff9ed", "border-bottom": "4px solid #dc7653",
        });
        expect(declarations(".studio-app-main", 800).background).toContain("#f7f5ee");
        expect(declarations(".studio-page", 800)["--mantine-color-dimmed"]).toContain("#52636a");
        expect(declarations('.studio-output-status:is([data-status="Needs attention"], [data-status="Destination conflict"])', 800).color).toContain("--mantine-color-red-8");
    });
});
