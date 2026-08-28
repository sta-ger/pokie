import {ArtifactConversionPlanner, type PokieProject} from "../../src/index.js";
import {PROJECT_TYPE_CAPABILITIES} from "../../src/project/ProjectCapabilities.js";

function project(type: PokieProject["type"]): PokieProject {
    return {type, rootPath: `/projects/${type}`, provenance: `${type} manifest`, capabilities: PROJECT_TYPE_CAPABILITIES[type]} as PokieProject;
}

describe("ArtifactConversionPlanner", () => {
    const planner = new ArtifactConversionPlanner();

    it("plans the non-circular Blueprint to Stake path through a canonical Outcome Library", () => {
        const plan = planner.plan(project("blueprint"), "stakeAdapter", {destinationPath: "/exports/stake"});

        expect(plan.status).toBe("planned");
        expect(plan.steps.map((step) => step.kind)).toEqual(["materializeRuntime", "generateOutcomeLibrary", "publish"]);
        expect(plan.steps.map((step) => step.choice)).toEqual(["materialize", "materialize", "publish"]);
        expect(plan.target.canonicalLocation).toBe("/exports/stake");
        expect(plan.preflight.losses).toEqual(["Stake export does not retain a game model or runtime."]);
    });

    it("keeps verified managed outcome reuse distinct from an ineligible stale candidate", () => {
        const reused = planner.plan(project("tsPackage"), "outcomeLibrary", {
            managedOutcome: {verified: true, identity: {kind: "outcomeLibrary", capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary}},
        });
        const stale = planner.plan(project("tsPackage"), "outcomeLibrary", {
            managedOutcome: {verified: false, staleReason: "configuration hash changed", identity: {kind: "outcomeLibrary", capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary}},
        });

        expect(reused.status).toBe("planned");
        expect(reused.steps).toHaveLength(1);
        expect(reused.steps[0].kind).toBe("reuseManagedOutcomeLibrary");
        expect(stale).toMatchObject({
            status: "planned",
            managedOutcome: {disposition: "ineligible", reason: "configuration hash changed"},
            steps: [{kind: "materializeRuntime"}, {kind: "generateOutcomeLibrary"}],
        });
    });

    it("publishes a selected managed reuse to the requested Outcome destination", () => {
        const reusable = planner.plan(project("tsPackage"), "outcomeLibrary", {
            destinationPath: "/exports/outcomes",
            managedOutcome: {
                verified: true,
                identity: {
                    kind: "outcomeLibrary",
                    canonicalLocation: "/managed/outcomes",
                    capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary,
                },
            },
        });

        expect(reusable).toMatchObject({
            status: "planned",
            target: {canonicalLocation: "/exports/outcomes"},
            steps: [
                {kind: "reuseManagedOutcomeLibrary", choice: "reuse"},
                {kind: "publish", choice: "publish", output: {canonicalLocation: "/exports/outcomes"}},
            ],
        });
    });

    it("does not trust a managed candidate flag when its persisted sampled provenance differs", () => {
        const source = {
            ...project("tsPackage"),
            configurationProvenance: {
                configurationHash: "source-hash",
                gameId: "slot",
                gameVersion: "1.0.0",
                manifestIdentity: "slot@1.0.0",
                pokieVersion: "1.3.0",
                generationSemantics: "boundedSample" as const,
                sampleCount: "100",
                sampleSeed: "seed-a",
            },
        };
        const plan = planner.plan(source, "outcomeLibrary", {
            managedOutcome: {
                verified: true,
                identity: {
                    kind: "outcomeLibrary",
                    capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary,
                    configurationProvenance: {...source.configurationProvenance, sampleSeed: "seed-b"},
                },
            },
        });

        expect(plan).toMatchObject({
            status: "planned",
            managedOutcome: {disposition: "ineligible", reason: expect.stringContaining("sample seed")},
            steps: [{kind: "materializeRuntime"}, {kind: "generateOutcomeLibrary"}],
        });
    });

    it("reports the exact unsupported boundary rather than a generic source matrix", () => {
        const outcomeToPackage = planner.plan(project("outcomeLibrary"), "tsPackage");
        const wasm = planner.plan(project("wasm"), "outcomeLibrary");
        const par = planner.plan(project("parWorkbook"), "stakeAdapter");

        expect(outcomeToPackage).toMatchObject({status: "unavailable", diagnostic: {code: "missing-data", failedEdge: {from: "outcomeLibrary", to: "tsPackage"}}});
        expect(outcomeToPackage.diagnostic?.message).toContain("does not preserve the game model");
        expect(wasm.diagnostic?.message).toContain("metadata-only");
        expect(par.diagnostic?.message).toContain("exchange snapshot");
    });
});
