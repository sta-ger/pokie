import fs from "fs";
import os from "os";
import path from "path";
import {computeGameBlueprintHash, GameBlueprint} from "pokie";
import {SimCommand} from "../../cli/commands/SimCommand.js";
import {ValidateCommand} from "../../cli/commands/ValidateCommand.js";
import {InMemoryRecentProjectsRepository} from "../../cli/studio/InMemoryRecentProjectsRepository.js";
import {StudioBlueprintService} from "../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../cli/studio/home/StudioHomeService.js";

function buildBlueprint(overrides: Partial<GameBlueprint> = {}): GameBlueprint {
    return {
        manifest: {id: "editor-slot", name: "Editor Slot", version: "0.1.0"},
        reels: 3,
        rows: 3,
        symbols: ["A", "B"],
        availableBets: [1, 2],
        paytable: {A: {3: 5}, B: {3: 2}},
        ...overrides,
    };
}

// End-to-end happy path for the Blueprint Editor's five endpoints, driven directly against
// StudioBlueprintService (the exact service StudioServer's /api/home/blueprints/* routes delegate to —
// see tests/cli/studio/StudioServer.test.ts for the HTTP-level version of this same workflow). Mirrors
// WizardBuildWorkflow.integration.test.ts's own "prove the output is indistinguishable from a
// hand-written <config.json> build" reasoning: this only fakes nothing — real GameBlueprintValidator,
// real GamePackageGenerator, real temp directories, and at the end the real ValidateCommand/SimCommand
// CLI pipeline against the generated package.
describe("Blueprint Editor workflow (integration): validate -> save -> load -> build-preview -> build", () => {
    let workDir: string;
    let studioRoot: string;
    let repository: InMemoryRecentProjectsRepository;
    let homeService: StudioHomeService;
    let service: StudioBlueprintService;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-blueprint-editor-workflow-test-"));
        studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-blueprint-editor-workflow-root-"));
        repository = new InMemoryRecentProjectsRepository();
        homeService = new StudioHomeService("1.3.0", repository);
        service = new StudioBlueprintService("1.3.0", studioRoot, homeService);
        jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
        fs.rmSync(studioRoot, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
    });

    it("round-trips save->load losslessly, builds a real package, and passes the real CLI validate/sim pipeline", async () => {
        const blueprintPath = path.join(workDir, "blueprint.json");
        const outDir = path.join(workDir, "built-game");
        const blueprint = buildBlueprint();

        expect(service.validate(blueprint)).toEqual({status: "ok", warnings: []});

        const saved = service.save(blueprintPath, blueprint, false);
        expect(saved).toEqual({status: "ok", path: blueprintPath});
        expect(fs.readFileSync(blueprintPath, "utf-8").endsWith("\n")).toBe(true);

        const loaded = service.load(blueprintPath);
        expect(loaded).toEqual({status: "ok", path: blueprintPath, blueprint, blueprintHash: computeGameBlueprintHash(blueprint)});

        const preview = service.previewBuild(blueprint, outDir, blueprintPath);
        expect(preview.status).toBe("ok");
        expect(fs.existsSync(outDir)).toBe(false);

        const built = await service.build(blueprint, outDir, blueprintPath);
        expect(built.status).toBe("ok");
        if (built.status !== "ok") {
            return;
        }
        expect(fs.existsSync(path.join(outDir, "src", "generated", "index.js"))).toBe(true);
        expect(await repository.list()).toHaveLength(1);

        // Re-saving unchanged content is byte-identical (deterministic formatting, no timestamps).
        const firstSaveBytes = fs.readFileSync(blueprintPath);
        const resaved = service.save(blueprintPath, blueprint, true);
        expect(resaved.status).toBe("ok");
        expect(fs.readFileSync(blueprintPath).equals(firstSaveBytes)).toBe(true);

        // Rebuilding the same outDir with the same blueprint is a safe, deterministic no-op rebuild —
        // GamePackageGenerator's own safe-rebuild/conflict detection, reused as-is.
        const rebuilt = await service.build(blueprint, outDir, blueprintPath);
        expect(rebuilt.status).toBe("ok");
        if (rebuilt.status === "ok") {
            expect(rebuilt.unchanged).toBe(true);
        }

        // The generated package is indistinguishable from one produced by "pokie build <config.json>".
        const validateExitCode = await new ValidateCommand().run([outDir]);
        expect(validateExitCode).toBe(0);

        const simFile = path.join(workDir, "sim.json");
        await new SimCommand().run([outDir, "--rounds", "200", "--seed", "demo", "--out", simFile]);
        const report = JSON.parse(fs.readFileSync(simFile, "utf-8"));
        expect(report.game).toEqual({id: "editor-slot", name: "Editor Slot", version: "0.1.0"});
        expect(report.rounds).toBe(200);
    });

    it("rejects an invalid blueprint at validate/build-preview/build without writing anything", async () => {
        const outDir = path.join(workDir, "out");
        const invalid = buildBlueprint({symbols: ["A", "A"]});

        expect(service.validate(invalid).status).toBe("invalid");
        expect(service.previewBuild(invalid).status).toBe("invalid");

        const built = await service.build(invalid, outDir);
        expect(built.status).toBe("invalid");
        expect(fs.existsSync(outDir)).toBe(false);
    });

    it("surfaces warnings without errors for a valid-but-unusual blueprint", () => {
        const result = service.validate(buildBlueprint({reels: 15}));

        expect(result.status).toBe("ok");
        if (result.status === "ok") {
            expect(result.warnings.length).toBeGreaterThan(0);
        }
    });

    it("refuses a save conflict and only writes once the request is resent with overwrite: true", () => {
        const blueprintPath = path.join(workDir, "blueprint.json");
        fs.writeFileSync(blueprintPath, "not a blueprint, pre-existing content");

        const conflict = service.save(blueprintPath, buildBlueprint(), false);
        expect(conflict.status).toBe("conflict");
        expect(fs.readFileSync(blueprintPath, "utf-8")).toBe("not a blueprint, pre-existing content");

        const overwritten = service.save(blueprintPath, buildBlueprint(), true);
        expect(overwritten.status).toBe("ok");
        expect(fs.readFileSync(blueprintPath, "utf-8")).toContain('"editor-slot"');
    });

    it("Home -> Project transition: a just-built blueprint package opens as a real PokieGame", async () => {
        const outDir = path.join(workDir, "out");

        const built = await service.build(buildBlueprint(), outDir);
        expect(built.status).toBe("ok");
        if (built.status !== "ok") {
            return;
        }

        const dashboard = await homeService.openProject(built.projectRoot);

        expect(dashboard.status).toBe("loaded");
        if (dashboard.status === "loaded") {
            expect(dashboard.game).toEqual({id: "editor-slot", name: "Editor Slot", version: "0.1.0"});
        }
    });
});
