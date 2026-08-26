import fs from "fs";
import os from "os";
import path from "path";
import {
    diffOutcomeSourceProjects,
    OutcomeLibraryBundleWriter,
    OutcomeSourceProjectAnalyzing,
    OutcomeSourceProjectReport,
    PokieProject,
    PROJECT_TYPE_CAPABILITIES,
    ProjectTargetResolver,
} from "pokie";
import {buildOutcomeLibraryBundleModeInput} from "../weightedoutcome/bundle/OutcomeLibraryBundleTestFixtures.js";

const blueprintProject: PokieProject = {
    type: "blueprint",
    rootPath: "/blueprints/game.json",
    capabilities: PROJECT_TYPE_CAPABILITIES.blueprint,
    provenance: "test fixture",
};

const outcomeLibraryProject: PokieProject = {
    type: "outcomeLibrary",
    rootPath: "/libraries/left",
    capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary,
    provenance: "test fixture",
};

const stakeAdapterProject: PokieProject = {
    type: "stakeAdapter",
    rootPath: "/stake/right",
    capabilities: PROJECT_TYPE_CAPABILITIES.stakeAdapter,
    provenance: "test fixture",
};

function reportFor(rootPath: string, kind: "native" | "stakeEngine", rtp: number, hitFrequency: number): OutcomeSourceProjectReport {
    return {
        rootPath,
        descriptor: {kind, streaming: kind === "native", limitations: []},
        issues: [],
        modes: [
            {
                modeName: "base",
                analysis: {
                    totalWeight: 1000,
                    rtp,
                    hitFrequency,
                    zeroWinFrequency: 1 - hitFrequency,
                    variance: 0.1,
                    standardDeviation: 0.3162,
                    maxWin: 500,
                    maxWinProbability: 0.001,
                    payoutDistribution: [],
                },
            },
        ],
    };
}

function stubAnalyzer(reports: Map<string, OutcomeSourceProjectReport>): OutcomeSourceProjectAnalyzing {
    return {
        analyze(project: PokieProject) {
            const report = reports.get(project.rootPath);
            if (report === undefined) {
                throw new Error(`no stub report for "${project.rootPath}"`);
            }
            return Promise.resolve(report);
        },
    };
}

// Proves P3-POLISH-21's own diff boundary: two resolved outcome-source projects -- native or Stake Engine, in
// any combination -- are diffed through their own canonical exact analyses (never a re-derived/regenerated
// game-model calculation), while a project of a type that carries no OUTCOME_SOURCE_READ_CAPABILITY at all
// (e.g. "blueprint") returns the ordinary capability diagnostic instead of throwing or analyzing anything.
describe("diffOutcomeSourceProjects", () => {
    it("returns the capability diagnostic, rather than analyzing anything, when the left project is unsupported", async () => {
        const analyzer = stubAnalyzer(new Map());

        const result = await diffOutcomeSourceProjects(blueprintProject, outcomeLibraryProject, analyzer);

        expect(result.supported).toBe(false);
        if (!result.supported) {
            expect(result.diagnostic.detectedType).toBe("blueprint");
            expect(result.diagnostic.missingCapability).toBe("outcomeSource.read");
        }
    });

    it("returns the capability diagnostic when the right project is unsupported", async () => {
        const analyzer = stubAnalyzer(new Map());

        const result = await diffOutcomeSourceProjects(outcomeLibraryProject, blueprintProject, analyzer);

        expect(result.supported).toBe(false);
        if (!result.supported) {
            expect(result.diagnostic.detectedType).toBe("blueprint");
        }
    });

    it("diffs a common mode's shared core metrics across two different source kinds", async () => {
        const reports = new Map([
            [outcomeLibraryProject.rootPath, reportFor(outcomeLibraryProject.rootPath, "native", 0.9, 0.25)],
            [stakeAdapterProject.rootPath, reportFor(stakeAdapterProject.rootPath, "stakeEngine", 0.95, 0.3)],
        ]);
        const analyzer = stubAnalyzer(reports);

        const result = await diffOutcomeSourceProjects(outcomeLibraryProject, stakeAdapterProject, analyzer);

        expect(result.supported).toBe(true);
        if (!result.supported) {
            return;
        }
        expect(result.diff.left).toEqual({rootPath: outcomeLibraryProject.rootPath, kind: "native", issues: []});
        expect(result.diff.right).toEqual({rootPath: stakeAdapterProject.rootPath, kind: "stakeEngine", issues: []});
        expect(result.diff.onlyInLeft).toEqual([]);
        expect(result.diff.onlyInRight).toEqual([]);
        expect(result.diff.changed).toBe(true);
        expect(result.diff.perMode.base.rtp.left).toBe(0.9);
        expect(result.diff.perMode.base.rtp.right).toBe(0.95);
        expect(result.diff.perMode.base.rtp.delta).toBeCloseTo(0.05, 10);
        expect(result.diff.perMode.base.rtp.percentDelta as number).toBeCloseTo((0.05 / 0.9) * 100, 6);
        expect(result.diff.perMode.base.hitFrequency.left).toBe(0.25);
        expect(result.diff.perMode.base.hitFrequency.right).toBe(0.3);
    });

    it("names a mode present on only one side instead of silently dropping it", async () => {
        const leftReport = reportFor(outcomeLibraryProject.rootPath, "native", 0.9, 0.25);
        const rightReport: OutcomeSourceProjectReport = {...reportFor(stakeAdapterProject.rootPath, "stakeEngine", 0.9, 0.25), modes: []};
        const analyzer = stubAnalyzer(
            new Map([
                [outcomeLibraryProject.rootPath, leftReport],
                [stakeAdapterProject.rootPath, rightReport],
            ]),
        );

        const result = await diffOutcomeSourceProjects(outcomeLibraryProject, stakeAdapterProject, analyzer);

        expect(result.supported).toBe(true);
        if (!result.supported) {
            return;
        }
        expect(result.diff.onlyInLeft).toEqual(["base"]);
        expect(result.diff.onlyInRight).toEqual([]);
        expect(result.diff.perMode).toEqual({});
        expect(result.diff.changed).toBe(true);
    });
});

// Real, non-stubbed end-to-end coverage: two real on-disk outcome-library bundles resolved and diffed through
// the same ProjectTargetResolver/OutcomeSourceProjectAnalyzer path the unit tests above stub out.
describe("diffOutcomeSourceProjects (integration, real outcome-library bundles)", () => {
    const resolver = new ProjectTargetResolver();
    let workDir: string;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-outcome-source-diff-test-"));
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    it("reports a zero diff for two bundles built from identical outcomes", async () => {
        const leftDir = path.join(workDir, "left");
        const rightDir = path.join(workDir, "right");
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "left-lib")], leftDir);
        await new OutcomeLibraryBundleWriter("1.3.0").writeToDirectory([buildOutcomeLibraryBundleModeInput("base", "right-lib")], rightDir);

        const left = (await resolver.resolve(leftDir)) as PokieProject;
        const right = (await resolver.resolve(rightDir)) as PokieProject;

        const result = await diffOutcomeSourceProjects(left, right);

        expect(result.supported).toBe(true);
        if (!result.supported) {
            return;
        }
        expect(result.diff.perMode.base.rtp.delta).toBeCloseTo(0, 10);
        expect(result.diff.perMode.base.hitFrequency.delta).toBeCloseTo(0, 10);
        expect(result.diff.changed).toBe(false);
    });
});
