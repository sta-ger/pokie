import fs from "fs";
import os from "os";
import path from "path";
import {
    ArtifactBuilderRegistry,
    ArtifactTargetType,
    BUILD_PRODUCT_MATRIX,
    BUILD_PRODUCT_MATRIX_SOURCE_TYPES,
    BUILD_PRODUCT_MATRIX_TARGETS,
    GameBlueprint,
    ParSheetExporter,
    PokieProject,
    ProjectTargetResolver,
    ProjectType,
} from "pokie";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {StudioArtifactBuildService} from "../../cli/studio/artifacts/StudioArtifactBuildService.js";

type SupportedCell = {readonly source: ProjectType; readonly target: ArtifactTargetType};

// Deliberately derived from production data rather than a second list of conversions. Every row below
// consequently grows (or fails loudly) when the product matrix changes.
const SUPPORTED_CELLS: readonly SupportedCell[] = BUILD_PRODUCT_MATRIX_SOURCE_TYPES.flatMap((source) =>
    BUILD_PRODUCT_MATRIX_TARGETS.map((target) => BUILD_PRODUCT_MATRIX[source][target]).filter((cell) => cell.state === "supported"),
);

const BLUEPRINT: GameBlueprint = {
    manifest: {id: "matrix-slot", name: "Matrix Slot", version: "1.0.0"},
    reels: 2,
    rows: 1,
    symbols: ["A", "B"],
    paytable: {A: {2: 1}},
    reelStrips: [["A", "B"], ["A", "B"]],
    availableBets: [1],
};

function defaultDestination(sourcePath: string, target: ArtifactTargetType): string {
    return path.join(path.dirname(sourcePath), target === "parWorkbook" ? "parWorkbook.xlsx" : target);
}

async function resolveRequired(resolver: ProjectTargetResolver, projectRoot: string): Promise<PokieProject> {
    const project = await resolver.resolve(projectRoot);
    if (project === undefined) throw new Error(`Matrix fixture was not recognized as a POKIE project: ${projectRoot}`);
    return project;
}

// Produces real, resolver-recognizable sources. An in-memory registry/resolver double could only prove its
// own imitation of the artifacts that the public registry, CLI, and Studio must consume.
async function createSource(
    source: ProjectType,
    fixtureRoot: string,
    resolver: ProjectTargetResolver,
    registry: ArtifactBuilderRegistry,
): Promise<string> {
    fs.mkdirSync(fixtureRoot, {recursive: true});
    const blueprintPath = path.join(fixtureRoot, "source.blueprint.json");
    fs.writeFileSync(blueprintPath, JSON.stringify(BLUEPRINT));

    switch (source) {
        case "blueprint":
            return blueprintPath;
        case "tsPackage": {
            const packageRoot = path.join(fixtureRoot, "source-ts-package");
            await registry.build("tsPackage", await resolveRequired(resolver, blueprintPath), packageRoot);
            return packageRoot;
        }
        case "outcomeLibrary": {
            const outcomeRoot = path.join(fixtureRoot, "source-outcome-library");
            await registry.build("outcomeLibrary", await resolveRequired(resolver, blueprintPath), outcomeRoot);
            return outcomeRoot;
        }
        case "stakeAdapter": {
            const stakeRoot = path.join(fixtureRoot, "source-stake-adapter");
            await registry.build("stakeAdapter", await resolveRequired(resolver, blueprintPath), stakeRoot);
            return stakeRoot;
        }
        case "parWorkbook": {
            const workbookPath = path.join(fixtureRoot, "source.par.xlsx");
            await new ParSheetExporter("1.3.0").exportToFile(BLUEPRINT, workbookPath);
            return workbookPath;
        }
        default:
            throw new Error(`Unsupported matrix fixture source: ${source}`);
    }
}

describe("BUILD_PRODUCT_MATRIX cross-surface lifecycle contract", () => {
    let workDir: string;
    let resolver: ProjectTargetResolver;
    let registry: ArtifactBuilderRegistry;
    let studio: StudioArtifactBuildService;
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-build-product-matrix-test-"));
        resolver = new ProjectTargetResolver();
        registry = new ArtifactBuilderRegistry("1.3.0");
        studio = new StudioArtifactBuildService("1.3.0", registry, resolver);
        logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        logSpy.mockRestore();
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    it("derives exactly the supported cells from BUILD_PRODUCT_MATRIX before exercising public surfaces", () => {
        expect(SUPPORTED_CELLS.map((cell) => `${cell.source}:${cell.target}`)).toEqual([
            "blueprint:tsPackage",
            "blueprint:outcomeLibrary",
            "blueprint:stakeAdapter",
            "tsPackage:outcomeLibrary",
            "tsPackage:stakeAdapter",
            "outcomeLibrary:outcomeLibrary",
            "outcomeLibrary:stakeAdapter",
            "stakeAdapter:stakeAdapter",
            "parWorkbook:parWorkbook",
        ]);
    });

    it.each(SUPPORTED_CELLS)("runs $source -> $target through registry, CLI, Studio, and its next public readback", async ({source, target}) => {
        const fixtureRoot = path.join(workDir, `${source}-${target}`);
        fs.mkdirSync(fixtureRoot, {recursive: true});
        const sourcePath = await createSource(source, fixtureRoot, resolver, registry);
        const sourceProject = await resolveRequired(resolver, sourcePath);
        const command = new BuildCommand("1.3.0", undefined, undefined, resolver, registry);

        // The registry's public matrix answer gates both higher-level callers.
        expect(registry.supportsConversionFrom(target, source)).toBe(true);
        expect(await registry.validate(target, sourceProject)).toBeUndefined();

        const defaultOut = defaultDestination(sourcePath, target);
        expect(await command.run([sourcePath, "--target", target])).toBe(0);
        expect(fs.existsSync(defaultOut)).toBe(true);

        // Resolver readback is the next public workflow for each emitted product; Studio consumes that
        // resolved shape rather than test-owned metadata to expose the product's following matrix choices.
        await expect(resolver.resolve(defaultOut)).resolves.toMatchObject({type: target, rootPath: defaultOut});
        expect(await studio.listTargets(defaultOut)).toEqual(expect.arrayContaining([
            expect.objectContaining({target, supported: BUILD_PRODUCT_MATRIX[target][target].state === "supported"}),
        ]));

        const explicitOut = path.join(fixtureRoot, `explicit-${target}${target === "parWorkbook" ? ".xlsx" : ""}`);
        // Runtime -> Outcome deliberately reuses a compatible managed result for one source. Give the
        // explicit-output assertion an equivalent but independently rooted source so it proves an actual
        // explicit publish instead of merely observing that intentional reuse branch.
        const explicitSourcePath = target === "outcomeLibrary" && (source === "blueprint" || source === "tsPackage")
            ? await createSource(source, path.join(fixtureRoot, "explicit-source"), resolver, registry)
            : sourcePath;
        await expect(studio.build(explicitSourcePath, target, explicitOut)).resolves.toMatchObject({
            status: "ok",
            target,
            outputPath: explicitOut,
            sourceType: source,
        });
        expect(fs.existsSync(explicitOut)).toBe(true);

        const dryRunOut = path.join(fixtureRoot, `dry-run-${target}${target === "parWorkbook" ? ".xlsx" : ""}`);
        expect(await command.run([sourcePath, "--target", target, "--out", dryRunOut, "--dry-run"])).toBe(0);
        expect(fs.existsSync(dryRunOut)).toBe(false);

        const occupiedOut = path.join(fixtureRoot, `occupied-${target}${target === "parWorkbook" ? ".xlsx" : ""}`);
        if (target === "parWorkbook") {
            fs.writeFileSync(occupiedOut, "preserve me");
        } else {
            fs.mkdirSync(occupiedOut);
            fs.writeFileSync(path.join(occupiedOut, "preserve-me.txt"), "preserve me");
        }
        const occupiedSourcePath = target === "outcomeLibrary" && (source === "blueprint" || source === "tsPackage")
            ? await createSource(source, path.join(fixtureRoot, "occupied-source"), resolver, registry)
            : sourcePath;
        await expect(studio.build(occupiedSourcePath, target, occupiedOut)).resolves.toMatchObject({status: "conflict", target});
        expect(target === "parWorkbook" ? fs.readFileSync(occupiedOut, "utf-8") : fs.readFileSync(path.join(occupiedOut, "preserve-me.txt"), "utf-8")).toBe("preserve me");

        // Both the literal source and a filesystem alias of it are forbidden destinations.
        const unsafeSourcePath = target === "outcomeLibrary" && (source === "blueprint" || source === "tsPackage")
            ? await createSource(source, path.join(fixtureRoot, "unsafe-source"), resolver, registry)
            : sourcePath;
        await expect(command.run([unsafeSourcePath, "--target", target, "--out", unsafeSourcePath])).rejects.toThrow(/source|same|inside|destination/i);
        const sourceAlias = `${unsafeSourcePath}-alias`;
        fs.symlinkSync(unsafeSourcePath, sourceAlias, fs.statSync(unsafeSourcePath).isDirectory() ? "dir" : "file");
        await expect(command.run([unsafeSourcePath, "--target", target, "--out", sourceAlias])).rejects.toThrow(/source|same|inside|destination/i);

        // Cancellation after a production builder starts must leave no output behind. Individual builder
        // suites additionally inject writer failures; this is the matrix-wide public cleanup assertion.
        const cleanupOut = path.join(fixtureRoot, `cleanup-${target}${target === "parWorkbook" ? ".xlsx" : ""}`);
        const cleanupSourcePath = target === "outcomeLibrary" && (source === "blueprint" || source === "tsPackage")
            ? await createSource(source, path.join(fixtureRoot, "cleanup-source"), resolver, registry)
            : sourcePath;
        const controller = new AbortController();
        const cleanup = await studio.build(cleanupSourcePath, target, cleanupOut, {
            signal: controller.signal,
            onProgress: () => controller.abort(),
        });
        expect(cleanup).toMatchObject({status: "cancelled"});
        expect(fs.existsSync(cleanupOut)).toBe(false);
    });
});
