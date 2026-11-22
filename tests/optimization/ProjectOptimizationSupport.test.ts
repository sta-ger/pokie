import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {ProjectOptimizationService} from "../../src/optimization/ProjectOptimizationService.js";
import {ProjectTargetResolver} from "../../src/project/ProjectTargetResolver.js";
import {optimizationBlueprint, optimizationRequest} from "../contracts/fixtures/OptimizationFixture.js";

describe("ProjectOptimizationService.support", () => {
    let directory: string;
    let service: ProjectOptimizationService;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-optimization-support-"));
        service = new ProjectOptimizationService(path.join(directory, "scratch"));
    });

    afterEach(() => {
        fs.rmSync(directory, {recursive: true, force: true});
    });

    async function blueprintProject() {
        const source = path.join(directory, "game.blueprint.json");
        fs.writeFileSync(source, JSON.stringify(optimizationBlueprint()));
        const project = await new ProjectTargetResolver().resolve(source);
        if (project === undefined) throw new Error("Failed to resolve the optimization fixture project.");
        return project;
    }

    it("returns writable fields even when the submitted tunable path is unsupported", async () => {
        const project = await blueprintProject();
        const request = optimizationRequest();
        request.policy.tunables = [{path: "/paytable/NOT_A_SYMBOL/2", values: [1, 2]}];

        const support = await service.support(project, request);

        expect(support.supported).toBe(false);
        expect(support.reason).toMatch(/Unknown policy path/);
        expect(support.writable).toContain("/paytable/A/2");
        expect(support.writable).toContain("/paytable/B/2");
    });

    it("still reports writable fields for a supported request", async () => {
        const project = await blueprintProject();
        const support = await service.support(project, optimizationRequest());

        expect(support.supported).toBe(true);
        expect(support.writable).toContain("/paytable/A/2");
    });
});
