import fs from "node:fs";
import path from "node:path";
import {POKIE_VERSION, type GameBlueprint} from "@fromstan/pokie";
import {StudioBlueprintService} from "../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../cli/studio/home/StudioHomeService.js";
import {InMemoryRecentProjectsRepository} from "../../cli/studio/InMemoryRecentProjectsRepository.js";
import {applyJsonText, loadBlueprintEditorState} from "../../cli/studio-client/src/domain/blueprintEditorState.js";
import {weightedBlueprint} from "./fixtures/WeightedWholeSequenceGame.js";

// Source-aware editor -> authoritative filesystem boundary checks. Real browser
// observations, observer independence and material finding closure are separate.
describe("V2C-35 draft correction and explicit persistence", () => {
    let directory: string;
    let service: StudioBlueprintService;
    let source: string;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.resolve("node_modules/.cache/pokie-tmp/valera35-"));
        service = new StudioBlueprintService(POKIE_VERSION, path.join(directory, "studio-assets"),
            new StudioHomeService(POKIE_VERSION, new InMemoryRecentProjectsRepository()));
        source = path.join(directory, "weighted design.blueprint.json");
        expect(service.save(source, weightedBlueprint, false).status).toBe("ok");
    });

    afterEach(() => fs.rmSync(directory, {recursive: true, force: true}));

    it("retains rejected JSON and weighted drafts until correction, then persists only on explicit Save", () => {
        const original = fs.readFileSync(source);
        const loaded = service.load(source);
        if (loaded.status !== "ok") throw new Error(loaded.error);
        const state = loadBlueprintEditorState(loaded.blueprint);
        const syntaxError = applyJsonText(state, '{"reelSequences":');
        expect(syntaxError.jsonError).toEqual(expect.any(String));
        expect(syntaxError.jsonText).toBe('{"reelSequences":');
        expect(syntaxError.blueprint).toBe(state.blueprint);

        const model: GameBlueprint = JSON.parse(JSON.stringify(weightedBlueprint));
        // Form/JSON accepts an object draft; the save boundary rejects conflicting reel authorities.
        model.reelStrips = [["A"], ["A"]];
        const invalidText = JSON.stringify(model);
        const invalid = applyJsonText(syntaxError, invalidText);
        expect(invalid.jsonError).toBeUndefined();
        expect(service.validate(invalid.blueprint).status).toBe("invalid");
        expect(service.save(source, invalid.blueprint, true, loaded.blueprintHash).status).toBe("error");
        expect(invalid.jsonText).toBe(invalidText);
        expect(fs.readFileSync(source)).toEqual(original);

        Reflect.deleteProperty(model, "reelStrips");
        model.availableBets = [0.05, 7.5, 1e-7];
        const sequence = model.reelSequences![0];
        if (sequence.type !== "weighted") throw new Error("Expected weighted source fixture");
        sequence.variants[0].id = "authored tiny weight";
        sequence.variants[0].weight = 1e-7;
        const corrected = applyJsonText(invalid, JSON.stringify(model));
        expect(service.validate(corrected.blueprint).status).toBe("ok");
        expect(corrected.revision).toBeGreaterThan(invalid.revision);
        expect(fs.readFileSync(source)).toEqual(original);
        expect(service.save(source, corrected.blueprint, true, loaded.blueprintHash).status).toBe("ok");
        expect(service.load(source)).toMatchObject({status: "ok", blueprint: model});
        expect(fs.readdirSync(directory)).toEqual([path.basename(source)]);
    });

    it("retains both external changes and the local draft after stale Save, then permits explicit Save As", () => {
        const loaded = service.load(source);
        if (loaded.status !== "ok") throw new Error(loaded.error);
        const model: GameBlueprint = JSON.parse(JSON.stringify(weightedBlueprint));
        model.manifest.name = "Local pending edits";
        const local = applyJsonText(loadBlueprintEditorState(loaded.blueprint), JSON.stringify(model));
        const localText = local.jsonText;
        const external = {...weightedBlueprint, manifest: {...weightedBlueprint.manifest, name: "Another tab saved"}};
        expect(service.save(source, external, true, loaded.blueprintHash).status).toBe("ok");
        const externalBytes = fs.readFileSync(source);
        expect(service.save(source, local.blueprint, true, loaded.blueprintHash)).toMatchObject({
            status: "conflict", reason: "stale", canSaveAs: true,
            editedBlueprint: model, currentBlueprint: external,
        });
        expect(local.jsonText).toBe(localText);
        expect(fs.readFileSync(source)).toEqual(externalBytes);
        const destination = path.join(directory, "retained local draft.json");
        expect(fs.existsSync(destination)).toBe(false);
        expect(service.save(destination, local.blueprint, false).status).toBe("ok");
        expect(service.load(destination)).toMatchObject({status: "ok", blueprint: model});
        expect(fs.readFileSync(source)).toEqual(externalBytes);
        expect(fs.readdirSync(directory).sort()).toEqual([path.basename(source), path.basename(destination)].sort());
    });
});
