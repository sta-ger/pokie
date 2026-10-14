import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
    ArtifactBuilderRegistry,
    BlueprintStakeOutcomeLibraryWorkflow,
    computeBlueprintHash,
    loadGameBlueprint,
    ParSheetImporter,
    ProjectTargetResolver,
    type GameBlueprint,
    type VideoSlotSession,
} from "@fromstan/pokie";
import {BuildCommand} from "../../../cli/commands/BuildCommand.js";
import {StudioArtifactBuildService} from "../../../cli/studio/artifacts/StudioArtifactBuildService.js";
import {weightedBlueprint, weightedGame} from "../../v2/fixtures/WeightedWholeSequenceGame.js";

const blueprint: GameBlueprint = {...weightedBlueprint, wilds: undefined, scatters: ["S"]};

describe("saved whole-sequence artifact targets", () => {
    let directory: string;
    let source: string;
    let service: StudioArtifactBuildService;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "studio-sequence-targets-"));
        source = path.join(directory, "blueprint.json");
        fs.writeFileSync(source, JSON.stringify(blueprint));
        service = new StudioArtifactBuildService("1.3.0");
    });

    afterEach(() => {
        jest.restoreAllMocks();
        fs.rmSync(directory, {recursive: true, force: true});
    });

    it("lists every target for the saved five-reel Home design without publishing anything", async () => {
        const homeBlueprint: GameBlueprint = {
            ...blueprint,
            reels: 5,
            rows: 3,
            reelSequences: [2.75, 3, 4, 5, 6].map((weight, index) => ({
                type: "weighted",
                variants: [{id: `home-r${index + 1}`, weight, symbols: ["A", "B", "S", "A"]}],
            })),
        };
        fs.writeFileSync(source, JSON.stringify(homeBlueprint));
        const bytes = fs.readFileSync(source);
        for (const selector of [source, directory]) {
            const targets = await service.listTargets(selector);
            expect(targets.map(({target}) => target).sort()).toEqual([
                "blueprint", "outcomeLibrary", "parWorkbook", "stakeAdapter", "tsPackage", "wasm",
            ]);
            for (const target of ["parWorkbook", "tsPackage", "outcomeLibrary", "stakeAdapter"]) {
                expect(targets.find((entry) => entry.target === target)).toMatchObject({
                    supported: true, state: "supported", plan: {status: "planned", source: {canonicalLocation: source}},
                });
            }
            expect(targets.find(({target}) => target === "wasm")).toMatchObject({
                supported: false, plan: {status: "unavailable", diagnostic: {code: "unsupported-boundary"}},
            });
        }
        expect(fs.readdirSync(directory)).toEqual(["blueprint.json"]);
        expect(fs.readFileSync(source)).toEqual(bytes);
    });

    it("previews and builds real XLSX bytes from discovered PAR targets, preserving identity and seeded behavior", async () => {
        const bytes = fs.readFileSync(source);
        const destination = path.join(directory, "sequences.xlsx");
        expect((await service.listTargets(directory)).find(({target}) => target === "parWorkbook")?.supported).toBe(true);
        expect(await service.preview(directory, "parWorkbook", destination)).toMatchObject({status: "ok"});
        expect(fs.existsSync(destination)).toBe(false);
        expect(await service.build(directory, "parWorkbook", destination)).toMatchObject({status: "ok", outputPath: destination});
        const imported = await new ParSheetImporter().importFromFile(destination);
        expect(imported.issues.filter(({severity}) => severity === "error")).toEqual([]);
        expect(imported.blueprint.reelSequences).toEqual(blueprint.reelSequences);
        expect(imported.conversionEvidence?.losslessEligible).toBe(true);
        expect(computeBlueprintHash(imported.blueprint)).toBe(computeBlueprintHash(blueprint));
        const games = [weightedGame(blueprint), weightedGame(imported.blueprint)];
        expect(games[1].getConfigHash?.()).toBe(games[0].getConfigHash?.());
        const sessions = games.map((game) => game.createSession({seed: "v2c09-seed"}) as VideoSlotSession);
        sessions.forEach((session) => session.setCreditsAmount(100));
        for (let round = 0; round < 12; round++) {
            sessions.forEach((session) => session.play());
            expect(sessions[1].toSessionState()).toEqual(sessions[0].toSessionState());
            expect(sessions[1].getSequenceStatistics()).toEqual(sessions[0].getSequenceStatistics());
        }
        const workbookBytes = fs.readFileSync(destination);
        expect(await service.preview(directory, "parWorkbook", destination)).toMatchObject({status: "conflict"});
        expect(await service.build(directory, "parWorkbook", destination)).toMatchObject({status: "conflict"});
        const signal = AbortSignal.abort();
        const cancelled = path.join(directory, "cancelled.xlsx");
        expect(await service.build(directory, "parWorkbook", cancelled, {signal})).toMatchObject({status: "cancelled"});
        expect(fs.existsSync(cancelled)).toBe(false);
        expect(fs.readFileSync(destination)).toEqual(workbookBytes);
        expect(fs.readFileSync(source)).toEqual(bytes);
    });

    it.each(["weighted", "exact"])("prepares the shared %s runtime with executable state validation", async (mode) => {
        if (mode === "exact") fs.writeFileSync(source, JSON.stringify({
            ...blueprint,
            reelSequences: [{type: "exact", symbols: ["A", "B"]}, {type: "exact", symbols: ["A", "A"]}],
        }));
        const project = (await new ProjectTargetResolver().resolve(source))!;
        const workflow = new BlueprintStakeOutcomeLibraryWorkflow("1.3.0", loadGameBlueprint);
        const prepared = await workflow.prepare(project);
        const session = prepared.game.createSession({seed: 42}) as VideoSlotSession;
        session.setCreditsAmount(100);
        session.play();
        const state = session.toSessionState();
        expect(() => prepared.game.validateLiveSessionState!(state, {seed: 42})).not.toThrow();
        expect(() => prepared.game.validateLiveSessionState!({invalid: true}, {seed: 42})).toThrow();
        expect(session.toSessionState()).toEqual(state);
    });

    it.each(["outcomeLibrary", "stakeAdapter"])("retains public CLI dry-run and registry planning for %s", async (target) => {
        const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        const project = (await new ProjectTargetResolver().resolve(source))!;
        const registry = new ArtifactBuilderRegistry("1.3.0");
        expect(await registry.preparePlan(project, target as "outcomeLibrary" | "stakeAdapter")).toMatchObject({status: "planned"});
        const command = new BuildCommand("1.3.0");
        const generations = target === "outcomeLibrary"
            ? [[], ["--exact"], ["--sample", "4", "--seed", "v2c09-seed"]]
            : [[]];
        for (const generation of generations) {
            expect(await command.run([source, "--target", target, "--dry-run", "--out", path.join(directory, target), ...generation])).toBe(0);
        }
        expect(log).toHaveBeenCalledWith("Conversion plan:");
        if (target === "stakeAdapter") await expect(command.run([source, "--target", target, "--exact", "--dry-run"]))
            .rejects.toThrow("only valid with --target outcomeLibrary");
        expect(fs.readdirSync(directory)).toEqual(["blueprint.json"]);
    });

    it("preserves exact bundle diagnostics and executes explicit sampled Outcome Library publication", async () => {
        jest.spyOn(console, "log").mockImplementation(() => undefined);
        const bytes = fs.readFileSync(source);
        const exact = path.join(directory, "exact-outcomes");
        await expect(new BuildCommand("1.3.0").run([
            source, "--target", "outcomeLibrary", "--exact", "--out", exact,
        ])).rejects.toThrow(/positive safe integer/);
        expect(fs.existsSync(exact)).toBe(false);
        const destination = path.join(directory, "outcomes");
        expect(await new BuildCommand("1.3.0").run([
            source, "--target", "outcomeLibrary", "--sample", "12", "--seed", "v2c09-seed", "--out", destination,
        ])).toBe(0);
        expect(await new ProjectTargetResolver().resolve(destination)).toMatchObject({type: "outcomeLibrary"});
        const targets = await service.listTargets(destination);
        expect(targets.find(({target}) => target === "stakeAdapter")).toMatchObject({supported: true});
        expect(targets.find(({target}) => target === "parWorkbook")).toMatchObject({
            supported: false, plan: {diagnostic: {code: "missing-data"}},
        });
        expect(await service.preview(destination, "stakeAdapter", path.join(directory, "stake"))).toMatchObject({
            status: "ok", stakePreflight: {route: "publish"},
        });
        expect(fs.readFileSync(source)).toEqual(bytes);
    });

    it("rejects a stale PAR plan without overwriting the saved design or creating output", async () => {
        const project = (await new ProjectTargetResolver().resolve(source))!;
        const registry = new ArtifactBuilderRegistry("1.3.0");
        const destination = path.join(directory, "stale.xlsx");
        const plan = await registry.preparePlan(project, "parWorkbook", {destinationPath: destination});
        fs.writeFileSync(source, JSON.stringify({...blueprint, manifest: {...blueprint.manifest, name: "Newer design"}}));
        const newerBytes = fs.readFileSync(source);
        await expect(registry.executePlan(plan, project, destination)).rejects.toThrow(/source artifact bytes changed/);
        expect(fs.existsSync(destination)).toBe(false);
        expect(fs.readFileSync(source)).toEqual(newerBytes);
    });
});
