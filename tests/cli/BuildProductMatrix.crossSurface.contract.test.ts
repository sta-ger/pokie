import fs from "fs";
import os from "os";
import path from "path";
import {
    ADVERTISED_ARTIFACT_BUILD_TARGETS,
    ArtifactBuildConflictError,
    ArtifactBuilderRegistry,
    ArtifactTargetType,
    BUILD_PRODUCT_MATRIX,
    BUILD_PRODUCT_MATRIX_SOURCE_TYPES,
    BUILD_PRODUCT_MATRIX_TARGETS,
    GameBlueprint,
    PokieProject,
    PROJECT_TYPE_CAPABILITIES,
    ProjectResolving,
    ProjectType,
} from "pokie";
import {BuildCommand} from "../../cli/commands/BuildCommand.js";
import {StudioArtifactBuildService} from "../../cli/studio/artifacts/StudioArtifactBuildService.js";
import {assertArtifactDestinationAvailable} from "../../src/project/internal/assertArtifactDestinationAvailable.js";
import {assertArtifactDestinationIsSafe} from "../../src/project/internal/assertArtifactDestinationIsSafe.js";
import {cleanupIncompleteArtifactOutput, captureArtifactDestinationState} from "../../src/project/ArtifactBuildOptions.js";

type SupportedCell = {
    readonly source: ProjectType;
    readonly target: ArtifactTargetType;
};

const SUPPORTED_CELLS: readonly SupportedCell[] = BUILD_PRODUCT_MATRIX_SOURCE_TYPES.flatMap((source) =>
    BUILD_PRODUCT_MATRIX_TARGETS.map((target) => BUILD_PRODUCT_MATRIX[source][target]).filter((cell) => cell.state === "supported"),
);

const BLUEPRINT: GameBlueprint = {
    manifest: {id: "matrix-slot", name: "Matrix Slot", version: "1.0.0"},
    reels: 2,
    rows: 1,
    symbols: ["A"],
    paytable: {A: {2: 1}},
    reelStrips: [["A"], ["A"]],
    availableBets: [1],
};

function destinationKindFor(target: ArtifactTargetType): "file" | "directory" {
    return target === "parWorkbook" ? "file" : "directory";
}

function defaultDestination(sourcePath: string, target: ArtifactTargetType): string {
    return path.join(path.dirname(sourcePath), target === "parWorkbook" ? "parWorkbook.xlsx" : target);
}

function projectFor(type: ProjectType, rootPath: string): PokieProject {
    return {
        type,
        rootPath,
        capabilities: PROJECT_TYPE_CAPABILITIES[type],
        provenance: "matrix contract fixture",
    } as PokieProject;
}

// This small filesystem registry deliberately models only the ArtifactBuilderRegistry public seam.  It makes
// every matrix cell cross the same CLI/Studio delegation paths while keeping the nine-cell lifecycle contract
// deterministic: real target writers have their own focused integration suites, whereas this contract must
// prove their shared caller-level guarantees for every supported source -> target cell.
class MatrixLifecycleRegistry {
    private readonly projectsByPath = new Map<string, PokieProject>();
    private failingDestination: string | undefined;

    public addProject(project: PokieProject): void {
        this.projectsByPath.set(path.resolve(project.rootPath), project);
    }

    public resolve(projectRoot: string): PokieProject | undefined {
        return this.projectsByPath.get(path.resolve(projectRoot));
    }

    public failAfterWriting(destinationPath: string): void {
        this.failingDestination = path.resolve(destinationPath);
    }

    public listTargets(): readonly ArtifactTargetType[] {
        return ADVERTISED_ARTIFACT_BUILD_TARGETS;
    }

    public describe(target: ArtifactTargetType): {readonly target: ArtifactTargetType; readonly unsupportedNotes: readonly string[]} {
        return {target, unsupportedNotes: []};
    }

    public supportsConversionFrom(target: ArtifactTargetType, source: ProjectType): boolean {
        return BUILD_PRODUCT_MATRIX[source][target].state === "supported";
    }

    public checkDestination(target: ArtifactTargetType, destinationPath: string, sourcePath?: string): {readonly available: true} | {readonly available: false; readonly message: string} {
        try {
            if (sourcePath !== undefined) assertArtifactDestinationIsSafe(sourcePath, destinationPath);
            assertArtifactDestinationAvailable(destinationPath, destinationKindFor(target));
            return {available: true};
        } catch (error) {
            if (error instanceof ArtifactBuildConflictError) return {available: false, message: error.message};
            throw error;
        }
    }

    public validate(target: ArtifactTargetType, source: PokieProject): Promise<void> {
        if (!this.supportsConversionFrom(target, source.type)) throw new Error(`unsupported matrix cell ${source.type}:${target}`);
        return Promise.resolve();
    }

    public async build(target: ArtifactTargetType, source: PokieProject, destinationPath: string): Promise<{readonly outputPath: string}> {
        const destination = path.resolve(destinationPath);
        const check = this.checkDestination(target, destination, source.rootPath);
        if (!check.available) throw new ArtifactBuildConflictError(check.message);

        const state = captureArtifactDestinationState(destination, destinationKindFor(target));
        try {
            if (destinationKindFor(target) === "file") {
                fs.mkdirSync(path.dirname(destination), {recursive: true});
                fs.writeFileSync(destination, JSON.stringify({source: source.type, target}));
            } else {
                fs.mkdirSync(destination, {recursive: true});
                fs.writeFileSync(path.join(destination, "pokie-build-product.json"), JSON.stringify({source: source.type, target}));
            }
            if (this.failingDestination === destination) {
                this.failingDestination = undefined;
                throw new Error("injected matrix publish failure");
            }
            this.addProject(projectFor(target, destination));
            return {outputPath: destination};
        } catch (error) {
            await cleanupIncompleteArtifactOutput(destination, state);
            throw error;
        }
    }
}

describe("BUILD_PRODUCT_MATRIX cross-surface lifecycle contract", () => {
    let workDir: string;
    let registry: MatrixLifecycleRegistry;
    let resolver: ProjectResolving;
    let studio: StudioArtifactBuildService;
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-build-product-matrix-test-"));
        registry = new MatrixLifecycleRegistry();
        resolver = {resolve: (projectRoot) => Promise.resolve(registry.resolve(projectRoot))};
        studio = new StudioArtifactBuildService("1.3.0", registry as unknown as ArtifactBuilderRegistry, resolver);
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
        const sourceDir = path.join(workDir, `${source}-${target}`);
        const sourcePath = path.join(sourceDir, "source.project");
        fs.mkdirSync(sourceDir, {recursive: true});
        fs.writeFileSync(sourcePath, JSON.stringify(BLUEPRINT));
        const sourceProject = projectFor(source, sourcePath);
        registry.addProject(sourceProject);

        // Registry's own public matrix answer is the source of truth that both higher-level surfaces consume.
        expect(new ArtifactBuilderRegistry().supportsConversionFrom(target, source)).toBe(true);
        expect(registry.supportsConversionFrom(target, source)).toBe(true);

        const command = new BuildCommand(
            "1.3.0",
            () => BLUEPRINT,
            {validate: () => []},
            resolver,
            registry as unknown as ArtifactBuilderRegistry,
        );
        const defaultOut = defaultDestination(sourcePath, target);
        expect(await command.run([sourcePath, "--target", target])).toBe(0);
        expect(fs.existsSync(defaultOut)).toBe(true);

        // The next public workflow resolves the emitted structure and exposes its own matrix targets in Studio.
        expect(await resolver.resolve(defaultOut)).toMatchObject({type: target, rootPath: defaultOut});
        expect(await studio.listTargets(defaultOut)).toEqual(expect.arrayContaining([
            expect.objectContaining({target, supported: BUILD_PRODUCT_MATRIX[target][target].state === "supported"}),
        ]));

        const explicitOut = path.join(sourceDir, `explicit-${target}${target === "parWorkbook" ? ".xlsx" : ""}`);
        await expect(studio.build(sourcePath, target, explicitOut)).resolves.toMatchObject({
            status: "ok",
            target,
            outputPath: explicitOut,
            sourceType: source,
        });
        expect(fs.existsSync(explicitOut)).toBe(true);

        const dryRunOut = path.join(sourceDir, `dry-run-${target}${target === "parWorkbook" ? ".xlsx" : ""}`);
        expect(await command.run([sourcePath, "--target", target, "--out", dryRunOut, "--dry-run"])).toBe(0);
        expect(fs.existsSync(dryRunOut)).toBe(false);

        const occupiedOut = path.join(sourceDir, `occupied-${target}${target === "parWorkbook" ? ".xlsx" : ""}`);
        if (destinationKindFor(target) === "file") {
            fs.writeFileSync(occupiedOut, "preserve me");
        } else {
            fs.mkdirSync(occupiedOut);
            fs.writeFileSync(path.join(occupiedOut, "preserve-me.txt"), "preserve me");
        }
        await expect(studio.build(sourcePath, target, occupiedOut)).resolves.toMatchObject({status: "conflict", target});
        expect(destinationKindFor(target) === "file" ? fs.readFileSync(occupiedOut, "utf-8") : fs.readFileSync(path.join(occupiedOut, "preserve-me.txt"), "utf-8")).toBe("preserve me");

        await expect(command.run([sourcePath, "--target", target, "--out", sourcePath])).rejects.toThrow(ArtifactBuildConflictError);
        expect(fs.readFileSync(sourcePath, "utf-8")).toBe(JSON.stringify(BLUEPRINT));

        const failedOut = path.join(sourceDir, `cleanup-${target}${target === "parWorkbook" ? ".xlsx" : ""}`);
        registry.failAfterWriting(failedOut);
        await expect(registry.build(target, sourceProject, failedOut)).rejects.toThrow("injected matrix publish failure");
        expect(fs.existsSync(failedOut)).toBe(false);
    });
});
