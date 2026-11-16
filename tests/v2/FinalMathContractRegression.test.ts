import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import * as api from "@fromstan/pokie";
import * as wasm from "@fromstan/pokie/wasm";
import {verifyFinalDelivery} from "../fixtures/math/FinalDeliveryContracts.js";
import {optimizationBlueprint, optimizationRequest} from "./fixtures/OptimizationFixture.js";
import {measureFinalWorkerContinuation} from "../fixtures/math/FinalWorkerContinuation.js";

// Source-level convergence regression only. The packaging owner runs the shared
// money/continuation assertions with native exports and real Workers.
// Authoritative N01/N02/A01–A06 mapping is controller input, not invented here.
describe("V2C-37 final math convergence", () => {
    it("preserves canonical money, additive grants, purchased rounds and durable restart through public consumers", async () => {
        const directory = fs.mkdtempSync(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/final-math-"));
        try {
            const makeGame = (blueprint: api.GameBlueprint): api.PokieGame => {
                const module = {exports: {}};
                vm.runInNewContext(api.renderBuiltGameModule(blueprint, "2.0.0"), {module, require: (name: string) => {
                    if (name !== "@fromstan/pokie") throw new Error(`Unexpected generated import: ${name}`);
                    return api;
                }});
                return module.exports as api.PokieGame;
            };
            expect(await verifyFinalDelivery(api, makeGame, path.join(directory, "rounds.sqlite"))).toEqual([
                "fractional-and-authoritative-payouts", "missing-zero-and-additive-grants",
                "weighted-purchased-rounds-restore-and-projection", "durable-settlement-response-loss-restart-and-rejection",
            ]);
        } finally {
            fs.rmSync(directory, {recursive: true, force: true}); 
        }
    });

    it("preserves real workbook recognition, import, export and optimization without changing the source", async () => {
        const directory = fs.mkdtempSync(path.join(process.cwd(), "node_modules/.cache/pokie-tmp/final-par-"));
        const service = new api.ProjectOptimizationService(path.join(directory, "scratch"));
        let candidate: api.OptimizationCandidate | undefined;
        try {
            const source = path.join(directory, "source.xlsx");
            expect((await new api.ParSheetExporter("2.0.0").exportToFile(optimizationBlueprint(), source)).filter(issue => issue.severity === "error")).toEqual([]);
            const original = fs.readFileSync(source);
            const project = await new api.ProjectTargetResolver().resolve(source);
            expect(project?.type).toBe("parWorkbook");
            const result = await service.optimize(project!, optimizationRequest());
            candidate = result.candidate;
            expect(result.status).toBe("success");
            expect(candidate).toBeDefined();
            const imported = await new api.ParSheetImporter().importFromFile(candidate!.path);
            expect(imported.blueprint?.paytable.A[2]).toBe(3);
            expect(fs.readFileSync(source)).toEqual(original);
        } finally {
            if (candidate) await service.discard(candidate);
            fs.rmSync(directory, {recursive: true, force: true});
        }
    });

    it("retains every mandatory authored workflow family, variant and surface owner", () => {
        expect(api.MANDATORY_AUTHORED_FAMILIES).toHaveLength(10);
        expect(api.AUTHORED_WORKFLOW_SURFACES).toEqual(["core", "schema", "editor", "build", "runtime-restore", "simulation-report", "extraction", "PAR", "replay"]);
        expect(api.AUTHORED_WORKFLOW_SUPPORT_CATALOG).toHaveLength(36);
        const families = new Set<string>();
        for (const row of api.AUTHORED_WORKFLOW_SUPPORT_CATALOG) {
            row.families.forEach(family => families.add(family));
            expect(Object.keys(row.cells)).toEqual(api.AUTHORED_WORKFLOW_SURFACES);
            for (const cell of Object.values(row.cells)) {
                expect(cell.assertion.length).toBeGreaterThan(0);
                expect(cell.negativeAssertion.length).toBeGreaterThan(0);
                expect(fs.existsSync(cell.testOwner)).toBe(true);
                expect(cell.exactFixture.length).toBeGreaterThan(0);
                expect(cell.negativeFixture.length).toBeGreaterThan(0);
            }
        }
        expect([...families].sort()).toEqual([...api.MANDATORY_AUTHORED_FAMILIES].sort());
    });

    it("bounds retained continuation and checkpoint copies without retaining a trace", async () => {
        const measured = await measureFinalWorkerContinuation(wasm, 1000);
        expect(measured.acceptedRounds).toBe(1001);
        expect(measured.snapshots.map(sample => sample.rounds)).toEqual([0, 100, 1000]);
        expect(measured.snapshots.every(sample => sample.bytes <= 512)).toBe(true);
    });
});
