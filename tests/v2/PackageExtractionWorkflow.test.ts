// Controller-owned public journey regression. Implementation workers prepare but do not execute it.
import fs from "fs";
import os from "os";
import path from "path";
import {
    ArtifactBuilderRegistry, computeGameBlueprintHash, GameBlueprintValidator, GamePackageGenerator,
    loadPokieGameRuntime, PackageBlueprintExtraction, ProjectTargetResolver,
    type GameBlueprint, type VideoSlotSession,
} from "@fromstan/pokie";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {StudioArtifactBuildService} from "../../cli/studio/artifacts/StudioArtifactBuildService.js";
import {buildProjectGameModel} from "../../cli/studio/blueprint/buildProjectGameModel.js";
import {StudioBlueprintService} from "../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioContextResolver} from "../../cli/studio/StudioContextResolver.js";
import {StudioHomeService} from "../../cli/studio/home/StudioHomeService.js";
import {FileStudioProjectRegistry} from "../../cli/studio/FileStudioProjectRegistry.js";
import {StudioProjectRegistrationService} from "../../cli/studio/StudioProjectRegistrationService.js";
import {fractionalBetBlueprint} from "../fixtures/math/FractionalBetFixture.js";
import {writeRunnableCodeFirstPackage} from "./fixtures/PackageExtractionFixture.js";

function inventory(directory: string): Record<string, string> {
    return Object.fromEntries(fs.readdirSync(directory, {recursive: true, withFileTypes: true})
        .filter(entry => entry.isFile()).map(entry => {
            const file = path.join(entry.parentPath, entry.name);
            return [path.relative(directory, file), fs.readFileSync(file).toString("base64")];
        }));
}
async function compareSeeded(source: string, regenerated: string, model: GameBlueprint, seed: string | number): Promise<void> {
    const loaded = await Promise.all([loadPokieGameRuntime(source), loadPokieGameRuntime(regenerated)]);
    const sessions = loaded.map(runtime => runtime.game.createSession({seed}) as VideoSlotSession);
    try {
        for (let round = 0; round < 24; round++) {
            for (const session of sessions) {
                session.setCreditsAmount(10000);
                session.setBet(model.availableBets![round % model.availableBets!.length]);
                session.play();
            }
            expect(sessions[0].getSymbolsCombination().toMatrix()).toEqual(sessions[1].getSymbolsCombination().toMatrix());
            expect(sessions[0].getWinAmount()).toBe(sessions[1].getWinAmount());
            expect(sessions[0].getWinEvaluationResult().getWinComponents()).toEqual(sessions[1].getWinEvaluationResult().getWinComponents());
            expect(sessions[0].toSessionState()).toEqual(sessions[1].toSessionState());
            const restored = loaded[1].game.createSession({seed: "different-initial-seed"}) as VideoSlotSession;
            try {
                restored.fromSessionState(sessions[0].toSessionState());
                for (const session of [...sessions, restored]) session.play();
                expect(restored.toSessionState()).toEqual(sessions[0].toSessionState());
                expect(restored.toSessionState()).toEqual(sessions[1].toSessionState());
            } finally {
                (restored as unknown as {destroy?: () => void}).destroy?.(); 
            }
        }
    } finally {
        for (const session of sessions) (session as unknown as {destroy?: () => void}).destroy?.();
        await Promise.all(loaded.map(runtime => runtime.release()));
    }
}

describe("package to editable Blueprint public journey (controller-owned)", () => {
    let directory: string;
    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-extraction-workflow-")); 
    });
    afterEach(() => {
        fs.rmSync(directory, {recursive: true, force: true}); 
    });

    it.each(["generated", "code-first"])("preserves %s identity, diagnostics, provenance, authored zeros and seeded continuation", async kind => {
        const generator = new GamePackageGenerator("1.3.0");
        const generatedModel = {...fractionalBetBlueprint([0.05, 7.5, 1e-7], true), paytable: {A: {3: 5}, B: {3: 0}}};
        const source = kind === "generated" ? generator.generate(generatedModel, directory, path.join(directory, "generated")).projectRoot
            : writeRunnableCodeFirstPackage(directory);
        const before = inventory(source);
        expect(Object.keys(before).some(file => (/blueprint.*\.json$/i).test(file))).toBe(false);
        const project = (await new ProjectTargetResolver().resolve(source))!;
        expect(project.type).toBe("tsPackage");
        expect(new StudioContextResolver().resolve(source)).toEqual({mode: "project", projectRoot: source});
        const registryFile = path.join(directory, "registry.json");
        const registration = new StudioProjectRegistrationService(new FileStudioProjectRegistry(registryFile));
        await registration.registerExternal(source);
        const extraction = await new PackageBlueprintExtraction().extract(source);
        expect(extraction.status).toBe("complete");
        const projection = await buildProjectGameModel(source, project, false, {
            loadBlueprint: () => {
                throw new Error("Package opening must not read a Blueprint"); 
            },
            inspectPackage: () => {
                throw new Error("Model preview must extract, not inspect"); 
            },
            importParWorkbook: () => {
                throw new Error("Not a PAR workbook"); 
            },
            readWasmManifest: () => {
                throw new Error("Not a WASM component"); 
            },
        });
        expect(projection.packageExtraction).toEqual(extraction);
        const destination = path.join(directory, "extracted.json");
        const registry = new ArtifactBuilderRegistry("1.3.0");
        const plan = await registry.preparePlan(project, "blueprint", {destinationPath: destination});
        await registry.validate("blueprint", project, plan);
        expect(plan.packageExtraction).toEqual(extraction);
        const service = new StudioArtifactBuildService("1.3.0", undefined, undefined, async (root, provenance) => {
            await registration.registerManaged(root, "Extracted", provenance?.sourceWorkbookPath, provenance?.conversionEvidencePath);
        });
        const preview = await service.preview(source, "blueprint", path.join(directory, "studio.json"));
        expect(preview.plan.packageExtraction).toEqual(extraction);
        if (preview.status !== "ok") throw new Error(preview.status);
        const logged: string[] = [];
        const log = jest.spyOn(console, "log").mockImplementation(value => {
            logged.push(String(value)); 
        });
        try {
            expect(await new BuildCommand("1.3.0").run([source, "--target", "blueprint", "--out", path.join(directory, "cli.json"), "--dry-run"])).toBe(0);
            for (const field of extraction.fields) expect(logged.join("\n")).toContain(`${field.path}: ${field.status}: ${field.authority}`);
            for (const diagnostic of extraction.diagnostics) expect(logged.join("\n")).toContain(diagnostic.message);
            expect(inventory(source)).toEqual(before);
            expect(fs.existsSync(destination)).toBe(false);
            expect(fs.existsSync(path.join(directory, "studio.json"))).toBe(false);
            expect(fs.existsSync(path.join(directory, "cli.json"))).toBe(false);
            const built = await registry.executePlan(plan, project, destination);
            expect(built.packageExtraction).toEqual(extraction);
            expect(await new BuildCommand("1.3.0").run([source, "--target", "blueprint", "--out", path.join(directory, "cli.json")])).toBe(0);
            const started = service.startPreparedExtraction(source, preview.preparedOperationId!, path.join(directory, "studio.json"));
            if (started.status !== "created") throw new Error(started.status);
            let terminal = service.getStatusForProject(source, started.job.id)!;
            for (let read = 0; read < 1000 && ["queued", "running", "cancelling"].includes(terminal.status); read++) {
                await new Promise<void>(resolve => {
                    setImmediate(resolve);
                });
                terminal = service.getStatusForProject(source, started.job.id)!;
            }
            expect(terminal.status).toBe("completed");
            expect(terminal.result?.plan.packageExtraction).toEqual(extraction);
        } finally {
            log.mockRestore();
            await service.cancelAll(); 
        }
        let evidenceBytes: Buffer | undefined;
        for (const output of [destination, path.join(directory, "cli.json"), path.join(directory, "studio.json")]) {
            const saved = JSON.parse(fs.readFileSync(output, "utf8"));
            expect(new GameBlueprintValidator().validate(saved).filter(issue => issue.severity === "error")).toEqual([]);
            expect(saved).toEqual(extraction.blueprint);
            const evidence = JSON.parse(fs.readFileSync(`${output}.conversion-evidence.json`, "utf8"));
            expect(evidence).toEqual({schemaVersion: 1, kind: "package-extraction", sourceBindingHash: plan.source.configurationProvenance!.inputBindingHash,
                extractedBlueprintHash: extraction.blueprintHash, extraction});
            evidenceBytes = fs.readFileSync(`${output}.conversion-evidence.json`);
            const regenerated = generator.generate(saved, directory, path.join(directory, `regenerated-${path.basename(output)}`));
            for (const seed of [37, "37", "extraction-seed"]) await compareSeeded(source, regenerated.projectRoot, saved, seed);
        }
        const reopened = new StudioProjectRegistrationService(new FileStudioProjectRegistry(registryFile));
        const entries = await reopened.list();
        expect(entries.find(entry => entry.location === source)).toMatchObject({type: "tsPackage"});
        expect(entries.find(entry => entry.location === path.join(directory, "studio.json"))).toMatchObject({type: "blueprint", conversionEvidencePath: path.join(directory, "studio.json.conversion-evidence.json")});
        expect(entries.find(entry => entry.location.endsWith("studio.json"))).not.toHaveProperty("importedFromParSheetPath");
        const editor = new StudioBlueprintService("1.3.0", path.join(directory, "studio-internal"), new StudioHomeService("1.3.0"));
        const authoringPath = path.join(directory, "studio.json");
        const loaded = editor.load(authoringPath);
        if (loaded.status !== "ok") throw new Error(loaded.status);
        const edited = {...loaded.blueprint as GameBlueprint, manifest: {...extraction.blueprint!.manifest, name: "Edited authoring project"}};
        expect(editor.save(authoringPath, edited, true, loaded.blueprintHash).status).toBe("ok");
        expect(computeGameBlueprintHash(JSON.parse(fs.readFileSync(authoringPath, "utf8")))).not.toBe(extraction.blueprintHash);
        expect(fs.readFileSync(`${authoringPath}.conversion-evidence.json`)).toEqual(evidenceBytes);
        expect(inventory(source)).toEqual(before);
    });
});
