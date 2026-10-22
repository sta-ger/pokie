import fs from "node:fs";
import path from "node:path";
import {POKIE_VERSION} from "@fromstan/pokie";
import {GameBlueprintValidator} from "../../src/generated/GameBlueprintValidator.js";
import {StudioBlueprintService} from "../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../cli/studio/home/StudioHomeService.js";
import {InMemoryRecentProjectsRepository} from "../../cli/studio/InMemoryRecentProjectsRepository.js";
import {setSymbolWeight} from "../../cli/studio-client/src/domain/blueprintFormOps.js";
import {optimizationBlueprint} from "./fixtures/OptimizationFixture.js";

it("retains exact -1 diagnostics through shared validation and explicit draft persistence, then saves corrected reuse", () => {
    const directory = fs.mkdtempSync(path.resolve("node_modules/.cache/pokie-tmp/valera35-weight-"));
    try {
        const service = new StudioBlueprintService(POKIE_VERSION, path.join(directory, "studio-assets"),
            new StudioHomeService(POKIE_VERSION, new InMemoryRecentProjectsRepository()));
        const source = path.join(directory, "source.blueprint.json");
        expect(service.save(source, optimizationBlueprint(), false).status).toBe("ok");
        const model: Record<string, unknown> = optimizationBlueprint();
        Reflect.deleteProperty(model, "reelStrips");
        // Keep the existing B award reachable when replacing literal reels by
        // weights. Repairing A must not mask another independently invalid field.
        setSymbolWeight(model, "B", 1);
        setSymbolWeight(model, "A", -1);
        const original = fs.readFileSync(source);
        const diagnostics = new GameBlueprintValidator().validate(model);
        expect(diagnostics).toEqual(expect.arrayContaining([expect.objectContaining({
            code: "blueprint-symbolweights-invalid-weight", message: '"symbolWeights.A" must be a positive integer.',
        })]));
        expect(service.validate(model)).toMatchObject({status: "invalid", errors: expect.arrayContaining([
            expect.objectContaining({code: "blueprint-symbolweights-invalid-weight"}),
        ])});
        // Advanced Save persists an explicit draft; semantic validity is owned
        // by validate and the required-valid UI actions, without coercing data.
        const draftPath = path.join(directory, "invalid weight draft.json");
        expect(service.save(draftPath, model, false).status).toBe("ok");
        expect(JSON.parse(fs.readFileSync(draftPath, "utf8")).symbolWeights).toEqual({A: -1, B: 1});
        const reloaded = service.load(draftPath);
        expect(reloaded).toMatchObject({status: "ok", blueprint: {symbolWeights: {A: -1, B: 1}}});
        if (reloaded.status !== "ok") throw new Error(reloaded.error);
        expect(service.validate(reloaded.blueprint)).toMatchObject({status: "invalid", errors: expect.arrayContaining([
            expect.objectContaining({code: "blueprint-symbolweights-invalid-weight"}),
        ])});
        expect(model.symbolWeights).toEqual({A: -1, B: 1});
        expect(fs.readFileSync(source)).toEqual(original);
        for (const weight of [2, 3]) {
            setSymbolWeight(model, "A", weight);
            expect(service.validate(model)).toMatchObject({status: "ok"});
            expect(service.save(source, model, true).status).toBe("ok");
            expect(service.load(source)).toMatchObject({status: "ok", blueprint: {symbolWeights: {A: weight, B: 1}}});
        }
    } finally {
        fs.rmSync(directory, {recursive: true, force: true});
    }
});
