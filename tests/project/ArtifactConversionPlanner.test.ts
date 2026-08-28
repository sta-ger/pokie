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

    it("keeps verified managed outcome reuse distinct from stale provenance", () => {
        const reused = planner.plan(project("tsPackage"), "outcomeLibrary", {
            managedOutcome: {verified: true, identity: {kind: "outcomeLibrary", capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary}},
        });
        const stale = planner.plan(project("tsPackage"), "outcomeLibrary", {
            managedOutcome: {verified: false, staleReason: "configuration hash changed", identity: {kind: "outcomeLibrary", capabilities: PROJECT_TYPE_CAPABILITIES.outcomeLibrary}},
        });

        expect(reused.status).toBe("planned");
        expect(reused.steps).toHaveLength(1);
        expect(reused.steps[0].kind).toBe("reuseManagedOutcomeLibrary");
        expect(stale).toMatchObject({status: "unavailable", diagnostic: {code: "stale-provenance", message: expect.stringContaining("configuration hash changed")}});
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
