import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {ProjectOptimizationService} from "../../src/optimization/ProjectOptimizationService.js";
import {ProjectTargetResolver} from "../../src/project/ProjectTargetResolver.js";
import {optimizationBlueprint, optimizationRequest} from "../contracts/fixtures/OptimizationFixture.js";
import type {GameBlueprint} from "../../src/generated/GameBlueprint.js";

function freeGamesOptimizationBlueprint(): GameBlueprint {
    return {
        info: {id: "opt-free-games", name: "Optimization Free Games", version: "1.0.0"},
        reels: 3,
        rows: 3,
        symbols: ["A", "K", "Q", "J", "S"],
        scatters: ["S"],
        paytable: {A: {3: 8}, K: {3: 6}, Q: {3: 4}, J: {3: 1}},
        reelStrips: [
            ["A", "K", "Q", "J", "J", "S", "A"],
            ["K", "Q", "A", "J", "J", "S", "K"],
            ["Q", "K", "J", "A", "J", "S", "Q"],
        ],
        paylines: [[0, 0, 0], [1, 1, 1], [2, 2, 2]],
        availableBets: [1],
        mechanics: {freeGames: {scatterSymbol: "S", awardsByCount: {3: 8}}},
    };
}

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

    it("offers free-game awards as writable fields and tunes total RTP on a whole paid round", async () => {
        const source = path.join(directory, "free-games.blueprint.json");
        fs.writeFileSync(source, JSON.stringify(freeGamesOptimizationBlueprint()));
        const project = await new ProjectTargetResolver().resolve(source);
        if (project === undefined) throw new Error("Failed to resolve the free-games fixture project.");
        const awardPath = "/mechanics/freeGames/awardsByCount/3";
        const request = {
            targets: [{metric: "rtp" as const, unit: "ratio" as const, value: 10, tolerance: {kind: "absolute" as const, value: 10}}],
            policy: {
                strategy: "exact-finite-v1" as const,
                seed: "free-games-total",
                budget: 3,
                maxOutcomes: 1000,
                mode: "base",
                stake: 1,
                scope: "logical-round" as const,
                tunables: [{path: awardPath, values: [8, 9, 10]}],
                locks: [],
            },
        };

        const support = await service.support(project, request);
        expect(support.supported).toBe(true);
        expect(support.writable).toContain(awardPath);

        const totalResult = await service.optimize(project, request);
        expect(totalResult.status).toBe("success");
        const totalRtp = totalResult.evidence?.measured?.[0];
        expect(typeof totalRtp).toBe("number");

        const paidResult = await service.optimize(project, {...request, policy: {...request.policy, scope: "paid-entry"}});
        expect(paidResult.status).toBe("success");
        const paidRtp = paidResult.evidence?.measured?.[0];
        expect(typeof paidRtp).toBe("number");
        expect(totalRtp as number).toBeGreaterThan(paidRtp as number);

        const changeRequest = {
            ...request,
            targets: [{metric: "rtp" as const, unit: "ratio" as const, value: 1.32, tolerance: {kind: "absolute" as const, value: 0.0001}}],
            policy: {...request.policy, budget: 1, tunables: [{path: awardPath, values: [9]}]},
        };
        const changeResult = await service.optimize(project, changeRequest);
        expect(changeResult.status).toBe("success");
        expect(changeResult.candidate).toBeDefined();
        await service.applyWithUndo(changeResult.candidate!, changeRequest);
        const saved = JSON.parse(fs.readFileSync(source, "utf8")) as GameBlueprint;
        expect(saved.mechanics?.freeGames?.awardsByCount["3"]).toBe(9);
    });
});
