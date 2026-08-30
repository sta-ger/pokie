import fs from "fs";
import os from "os";
import path from "path";
import {ArtifactBuilderRegistry, computeBlueprintHash, type GameBlueprint, ProjectTargetResolver} from "pokie";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {ParCommand} from "../../cli/commands/ParCommand.js";
import {StakeEngineCommand} from "../../cli/commands/StakeEngineCommand.js";

const POKIE_VERSION = "1.3.0";

describe("PC-14 CLI real-artifact interoperability torture", () => {
    let workDir: string;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-artifact-torture-"));
        jest.spyOn(console, "log").mockImplementation(() => undefined);
        jest.spyOn(console, "error").mockImplementation(() => undefined);
    });

    afterEach(() => {
        fs.rmSync(workDir, {recursive: true, force: true});
        (console.log as jest.Mock).mockRestore();
        (console.error as jest.Mock).mockRestore();
    });

    it("chains generated PAR, package, Outcome Library and Stake artifacts without replacing provenance", async () => {
        const blueprint: GameBlueprint = {
            manifest: {id: "artifact-torture", name: "Artifact Torture", version: "1.0.0"},
            reels: 2,
            rows: 1,
            symbols: ["A", "B"],
            paytable: {A: {2: 3}},
            reelStrips: [["A", "B"], ["A", "B"]],
            availableBets: [1],
        };
        const blueprintPath = path.join(workDir, "source.blueprint.json");
        const workbookPath = path.join(workDir, "source.par.xlsx");
        const importedBlueprintPath = path.join(workDir, "imported.blueprint.json");
        fs.writeFileSync(blueprintPath, JSON.stringify(blueprint));

        expect(await new ParCommand(POKIE_VERSION).run(["export", blueprintPath, "--out", workbookPath])).toBe(0);
        expect(await new ParCommand(POKIE_VERSION).run(["import", workbookPath, "--out", importedBlueprintPath])).toBe(0);
        const parEvidence = JSON.parse(fs.readFileSync(`${importedBlueprintPath}.conversion-evidence.json`, "utf-8"));
        expect(parEvidence).toMatchObject({
            provenance: {blueprintHash: computeBlueprintHash(blueprint)},
            importedBlueprintHash: computeBlueprintHash(blueprint),
            provenanceHashMatches: true,
            losslessEligible: true,
        });

        const resolver = new ProjectTargetResolver();
        const registry = new ArtifactBuilderRegistry(POKIE_VERSION).withRuntimePackageRoot(process.cwd());
        const build = new BuildCommand(POKIE_VERSION, undefined, undefined, resolver, registry);
        const packagePath = path.join(workDir, "package");
        const libraryPath = path.join(workDir, "library");
        const stakePath = path.join(workDir, "stake");
        const importedLibraryPath = path.join(workDir, "imported-library");
        const reexportedStakePath = path.join(workDir, "stake-reexported");

        expect(await build.run([importedBlueprintPath, "--target", "tsPackage", "--out", packagePath])).toBe(0);
        expect(await build.run([packagePath, "--target", "outcomeLibrary", "--out", libraryPath])).toBe(0);
        expect(await build.run([libraryPath, "--target", "stakeAdapter", "--out", stakePath])).toBe(0);
        expect(await new StakeEngineCommand(POKIE_VERSION).run(["import", stakePath, "--out", importedLibraryPath])).toBe(0);
        expect(await build.run([importedLibraryPath, "--target", "stakeAdapter", "--out", reexportedStakePath])).toBe(0);

        const sourceManifest = JSON.parse(fs.readFileSync(path.join(libraryPath, "manifest.json"), "utf-8"));
        const importedManifest = JSON.parse(fs.readFileSync(path.join(importedLibraryPath, "manifest.json"), "utf-8"));
        const stakeManifest = JSON.parse(fs.readFileSync(path.join(stakePath, "pokie-manifest.json"), "utf-8"));
        const sourceProvenance = JSON.parse(fs.readFileSync(path.join(importedLibraryPath, "source-provenance.json"), "utf-8"));
        expect(importedManifest).toMatchObject({
            game: sourceManifest.game,
            configHash: sourceManifest.configHash,
            pokieVersion: sourceManifest.pokieVersion,
        });
        expect(sourceProvenance).toMatchObject({
            manifestHash: expect.stringMatching(/^sha256:/),
            indexHash: expect.stringMatching(/^sha256:/),
            modes: [{modeName: "base", csvHash: expect.stringMatching(/^sha256:/), booksHash: expect.stringMatching(/^sha256:/)}],
        });
        expect(stakeManifest).toMatchObject({game: sourceManifest.game, configHash: sourceManifest.configHash, pokieVersion: sourceManifest.pokieVersion});
        expect(fs.existsSync(path.join(reexportedStakePath, "pokie-manifest.json"))).toBe(true);
    });
});
