import {execFileSync} from "node:child_process";
import {constants, runInThisContext} from "node:vm";
import {pathToFileURL} from "node:url";
import {createPackageExtractionTestEnvironment, PACKAGE_EXTRACTION_TEST_TIMEOUT} from "../v2/fixtures/PackageExtractionFixture.js";
import fs from "fs";
import os from "os";
import path from "path";
import ts from "typescript";
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
} from "@fromstan/pokie";
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

function targetExtension(target: ArtifactTargetType): string {
    const extensions: Partial<Record<ArtifactTargetType, string>> = {blueprint: ".json", parWorkbook: ".xlsx", wasm: ".wasm"};
    return extensions[target] ?? "";
}

function defaultDestination(sourcePath: string, target: ArtifactTargetType): string {
    let name: string = target;
    if (target === "parWorkbook") name = "parWorkbook.xlsx";
    if (target === "wasm") name = "game.wasm";
    if (target === "blueprint") name = "blueprint.json";
    return path.join(path.dirname(sourcePath), name);
}

async function resolveRequired(resolver: ProjectTargetResolver, projectRoot: string): Promise<PokieProject> {
    const project = await resolver.resolve(projectRoot);
    if (project === undefined) throw new Error(`Matrix fixture was not recognized as a POKIE project: ${projectRoot}`);
    return project;
}

// Source-contract fixture, never a delivered-package substitute. Snapshotting the whole checkout
// repeatedly copies its docs, test evidence and every compiled output tree. Give native generated
// modules the current source runtime alone, keeping the real loader and dependency graph intact.
function createMatrixRuntimeFixture(directory: string): void {
    const metadata = JSON.parse(fs.readFileSync(path.join(process.cwd(), "package.json"), "utf8"));
    fs.mkdirSync(directory);
    fs.writeFileSync(path.join(directory, "package.json"), JSON.stringify({
        name: metadata.name,
        version: metadata.version,
        type: "commonjs",
        main: "./index.js",
        exports: {".": "./index.js"},
        dependencies: metadata.dependencies,
    }));
    const compile = (sourceDirectory: string, outputDirectory: string): void => {
        fs.mkdirSync(outputDirectory, {recursive: true});
        for (const entry of fs.readdirSync(sourceDirectory, {withFileTypes: true})) {
            const source = path.join(sourceDirectory, entry.name);
            const output = path.join(outputDirectory, entry.name);
            if (entry.isDirectory()) compile(source, output);
            else if (entry.name.endsWith(".mjs")) fs.copyFileSync(source, output);
            else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")) {
                fs.writeFileSync(output.replace(/\.ts$/, ".js"), ts.transpileModule(fs.readFileSync(source, "utf8"), {
                    fileName: source,
                    compilerOptions: {module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true},
                }).outputText);
            }
        }
    };
    compile(path.join(process.cwd(), "src"), directory);
    fs.symlinkSync(path.join(process.cwd(), "node_modules"), path.join(directory, "node_modules"), "dir");
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
    let restoreTemporaryDirectory: () => void;
    let runtimeFixture: string;
    beforeAll(() => {
        restoreTemporaryDirectory = createPackageExtractionTestEnvironment();
        runtimeFixture = path.join(os.tmpdir(), "matrix-source-runtime");
        createMatrixRuntimeFixture(runtimeFixture);
    });
    afterAll(() => {
        restoreTemporaryDirectory();
    });

    let workDir: string;
    let resolver: ProjectTargetResolver;
    let registry: ArtifactBuilderRegistry;
    let studio: StudioArtifactBuildService;
    let logSpy: jest.SpyInstance;

    beforeEach(() => {
        workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-build-product-matrix-test-"));
        resolver = new ProjectTargetResolver();
        registry = new ArtifactBuilderRegistry("1.3.0").withRuntimePackageRoot(runtimeFixture);
        studio = new StudioArtifactBuildService("1.3.0", registry, resolver);
        logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);
    });

    afterEach(() => {
        logSpy.mockRestore();
        fs.rmSync(workDir, {recursive: true, force: true});
    });

    it("admits the complete V2C-31 repair in both candidate readers while protecting product inputs and pins", async () => {
        const load = (file: string): Promise<unknown> => runInThisContext(
            `import(${JSON.stringify(pathToFileURL(path.resolve(__dirname, "../..", file)).href)})`,
            {importModuleDynamically: constants.USE_MAIN_CONTEXT_DEFAULT_LOADER},
        ) as Promise<unknown>;
        const p9 = await load("scripts/p9-11-candidate.mjs") as {
            authenticateP911Tree: (candidate: string, tree: string, repository: string) => {changedEvidenceAndTooling: string[]};
            authenticateP911Driver: (reference: {path: string; sha256: string}) => Promise<void>;
            readPinnedJson: (reference: {path: string; sha256: string}) => Promise<unknown>;
            sha256: (bytes: Buffer) => string;
        };
        const p8 = await load("scripts/p8-05-release-handoff.mjs") as {
            authenticateP805ProductTree: (candidate: string, reviewed: string, repository: string) => {changedToolingAndEvidencePaths: string[]};
        };
        const fixture = await load("tests/testUtils/createP911CandidateFixture.mjs") as {P911_TOOLING_DESCENDANT_PATHS: string[]};
        // Independent of either reader's admission list: this is the complete delta since the
        // authenticated installed candidate, including these readers and their regression fixture.
        const repairPaths = [
            "docs/v2-completion/V2C-31.md",
            "tests/cli/BuildProductMatrix.crossSurface.contract.test.ts",
            "tests/cli/studio/replay/StudioReplayExecutionService.test.ts",
            "tests/packaging/helpers/selectPackedArchive.ts",
            "tests/packaging/npmPackSmoke.test.ts",
            "tests/v2/StableConsumerContracts.test.ts",
            "tests/v2/fixtures/normal-pack.stdout.txt",
            "scripts/p8-05-release-handoff.mjs",
            "scripts/p9-11-candidate.mjs",
            "tests/testUtils/createP911CandidateFixture.mjs",
            "tests/scripts/p9-11-produce-candidate.test.mjs",
            "tests/scripts/p9-11-corrective-closeout.test.mjs",
        ];
        expect(fixture.P911_TOOLING_DESCENDANT_PATHS).toEqual(expect.arrayContaining(repairPaths));
        const repository = path.join(workDir, "candidate-repository");
        fs.mkdirSync(repository);
        const git = (...args: string[]): string => execFileSync("git", args, {cwd: repository, encoding: "utf8"}).trim();
        const write = (file: string, value: string): void => {
            fs.mkdirSync(path.dirname(path.join(repository, file)), {recursive: true});
            fs.writeFileSync(path.join(repository, file), value);
        };
        const commit = (): string => {
            git("add", ".");
            git("-c", "user.name=sta-ger", "-c", "user.email=pascaldelger@gmail.com", "commit", "--quiet", "-m", "fixture transition");
            return git("rev-parse", "HEAD");
        };
        git("init", "--quiet");
        write("package.json", '{"name":"@fromstan/pokie","version":"2.0.0"}\n');
        const candidate = commit();
        const tree = git("rev-parse", "HEAD^{tree}");
        for (const file of repairPaths) write(file, "reviewed tooling/evidence fixture\n");
        const reviewed = commit();
        const authenticate = (): void => {
            expect(p9.authenticateP911Tree(candidate, tree, repository).changedEvidenceAndTooling).toEqual([...repairPaths].sort());
            expect(p8.authenticateP805ProductTree(candidate, git("rev-parse", "HEAD"), repository).changedToolingAndEvidencePaths).toEqual([...repairPaths].sort());
        };
        authenticate();
        for (const file of ["src/runtime.ts", "cli/pokie.ts", "package.json", "package-lock.json", "tsconfig.prod.json", "generate-barrels.js", "tests/v2/unrelated.test.ts", "docs/v2-completion/V2C-30.md"]) {
            write(file, "changed protected input\n");
            commit();
            expect(() => p9.authenticateP911Tree(candidate, tree, repository)).toThrow("product/build inputs changed");
            expect(() => p8.authenticateP805ProductTree(candidate, git("rev-parse", "HEAD"), repository)).toThrow("product or build inputs");
            git("reset", "--hard", reviewed);
            authenticate();
        }
        const alias = repairPaths[0];
        fs.rmSync(path.join(repository, alias));
        fs.symlinkSync("../../package.json", path.join(repository, alias));
        commit();
        expect(() => p9.authenticateP911Tree(candidate, tree, repository)).toThrow("nonregular");
        expect(() => p8.authenticateP805ProductTree(candidate, git("rev-parse", "HEAD"), repository)).toThrow("nonregular");
        git("reset", "--hard", reviewed);
        authenticate();
        const pinned = path.join(workDir, "pinned.json");
        fs.writeFileSync(pinned, '{"controller":"fixture"}\n');
        const reference = {path: pinned, sha256: p9.sha256(fs.readFileSync(pinned))};
        await expect(p9.readPinnedJson(reference)).resolves.toEqual({controller: "fixture"});
        await expect(p9.authenticateP911Driver(reference)).resolves.toBeUndefined();
        fs.writeFileSync(pinned, '{"controller":"changed"}\n');
        await expect(p9.readPinnedJson(reference)).rejects.toThrow("digest mismatch");
        await expect(p9.authenticateP911Driver(reference)).rejects.toThrow("authenticated controller browser driver required");
        fs.writeFileSync(pinned, '{"controller":"fixture"}\n');
        await expect(p9.readPinnedJson(reference)).resolves.toEqual({controller: "fixture"});
        await expect(p9.authenticateP911Driver(reference)).resolves.toBeUndefined();
    });

    it("derives exactly the supported cells from BUILD_PRODUCT_MATRIX before exercising public surfaces", () => {
        expect(SUPPORTED_CELLS.map((cell) => `${cell.source}:${cell.target}`)).toEqual([
            "blueprint:tsPackage",
            "blueprint:outcomeLibrary",
            "blueprint:stakeAdapter",
            "blueprint:parWorkbook",
            "blueprint:wasm",
            "tsPackage:blueprint",
            "tsPackage:tsPackage",
            "tsPackage:outcomeLibrary",
            "tsPackage:stakeAdapter",
            "tsPackage:parWorkbook",
            "tsPackage:wasm",
            "outcomeLibrary:outcomeLibrary",
            "outcomeLibrary:stakeAdapter",
            "stakeAdapter:stakeAdapter",
            "parWorkbook:blueprint",
            "parWorkbook:tsPackage",
            "parWorkbook:outcomeLibrary",
            "parWorkbook:stakeAdapter",
            "parWorkbook:parWorkbook",
            "parWorkbook:wasm",
        ]);
    });

    it("keeps both public documentation entrypoints aligned with BUILD_PRODUCT_MATRIX and the Blueprint-to-PAR snapshot contract", () => {
        const cliDocumentation = fs.readFileSync(path.resolve(process.cwd(), "docs/cli.md"), "utf-8").replace(/\s+/g, " ");
        const readmeDocumentation = fs.readFileSync(path.resolve(process.cwd(), "docs/README.md"), "utf-8").replace(/\s+/g, " ");
        expect(cliDocumentation).toContain("conditional supported edges");
        expect(cliDocumentation).toContain("when public model extraction is complete");
        for (const source of BUILD_PRODUCT_MATRIX_SOURCE_TYPES.filter(type => type !== "wasm")) {
            expect(cliDocumentation).toContain(`\`${source}\` →`);
        }

        const targetOptionMatch = cliDocumentation.match(/- `--target <artifact>` —(.+?)(?= - `--out <path>`)/);
        const failureModesMatch = cliDocumentation.match(/Failure modes: (.+?)(?= ### Conflict handling)/);
        expect(BUILD_PRODUCT_MATRIX.blueprint.parWorkbook.state).toBe("supported");
        expect(targetOptionMatch?.[1]).not.toContain("`parWorkbook` from a `blueprint` source");
        expect(failureModesMatch?.[1]).not.toContain("`parWorkbook` from a `blueprint` source");

        for (const supportedTarget of ["outcomeLibrary", "stakeAdapter"] as const) {
            const obsoleteBlueprintFailure = new RegExp("`" + supportedTarget + "` from a `blueprint` source[^.]*\\bthrows\\b", "i");
            expect(cliDocumentation).not.toMatch(obsoleteBlueprintFailure);
        }

        for (const documentation of [readmeDocumentation, cliDocumentation]) {
            expect(documentation).toMatch(/(?:`GameBlueprint`|`blueprint`) (?:->|→) `tsPackage`\/`outcomeLibrary`\/`stakeAdapter`\/`parWorkbook`/);
            expect(documentation).toContain("pokie par export");
            expect(documentation).toMatch(/deterministic literal workbook snapshot/i);
            expect(documentation).toMatch(/(?:authored|source) Blueprint remains unchanged/i);
            expect(documentation).toMatch(/`parsheet-reel-generation-failed`/);
            expect(documentation).toMatch(/`parsheet-reel-generation-seed-required`/);
            expect(documentation).toMatch(/`reelStripGeneration\[index\]`/);
            expect(documentation).toMatch(/`reelStripGeneration\[index\]\.seed`/);
            expect(documentation).not.toMatch(/procedural reel generation[^.]*not supported/i);
        }
        expect(cliDocumentation).toMatch(/exported literal snapshot/i);
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

        const explicitOut = path.join(fixtureRoot, `explicit-${target}${targetExtension(target)}`);
        // Runtime -> Outcome deliberately reuses a compatible managed result for one source. Give the
        // explicit-output assertion an equivalent but independently rooted source so it proves an actual
        // explicit publish instead of merely observing that intentional reuse branch.
        const explicitSourcePath = target === "outcomeLibrary" && (source === "blueprint" || source === "tsPackage")
            ? await createSource(source, path.join(fixtureRoot, "explicit-source"), resolver, registry)
            : sourcePath;
        expect(await command.run([explicitSourcePath, "--target", target, "--out", explicitOut])).toBe(0);
        expect(fs.existsSync(explicitOut)).toBe(true);

        const studioOut = path.join(fixtureRoot, `studio-${target}${targetExtension(target)}`);
        const studioSourcePath = target === "outcomeLibrary" && (source === "blueprint" || source === "tsPackage")
            ? await createSource(source, path.join(fixtureRoot, "studio-source"), resolver, registry)
            : explicitSourcePath;
        await expect(studio.build(studioSourcePath, target, studioOut)).resolves.toMatchObject({
            status: "ok",
            target,
            outputPath: studioOut,
            sourceType: source,
        });
        expect(fs.existsSync(studioOut)).toBe(true);

        const dryRunOut = path.join(fixtureRoot, `dry-run-${target}${targetExtension(target)}`);
        expect(await command.run([sourcePath, "--target", target, "--out", dryRunOut, "--dry-run"])).toBe(0);
        expect(fs.existsSync(dryRunOut)).toBe(false);

        const occupiedOut = path.join(fixtureRoot, `occupied-${target}${targetExtension(target)}`);
        if (["blueprint", "parWorkbook", "wasm"].includes(target)) {
            fs.writeFileSync(occupiedOut, "preserve me");
        } else {
            fs.mkdirSync(occupiedOut);
            fs.writeFileSync(path.join(occupiedOut, "preserve-me.txt"), "preserve me");
        }
        const occupiedSourcePath = target === "outcomeLibrary" && (source === "blueprint" || source === "tsPackage")
            ? await createSource(source, path.join(fixtureRoot, "occupied-source"), resolver, registry)
            : sourcePath;
        await expect(command.run([occupiedSourcePath, "--target", target, "--out", occupiedOut])).rejects.toThrow(
            new RegExp(`Cannot build target "${target}".*Next: choose a different --out path`, "s"),
        );
        await expect(studio.build(occupiedSourcePath, target, occupiedOut)).resolves.toMatchObject({status: "conflict", target});
        expect(["blueprint", "parWorkbook", "wasm"].includes(target) ? fs.readFileSync(occupiedOut, "utf-8") : fs.readFileSync(path.join(occupiedOut, "preserve-me.txt"), "utf-8")).toBe("preserve me");

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
        const cleanupOut = path.join(fixtureRoot, `cleanup-${target}${targetExtension(target)}`);
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
    }, PACKAGE_EXTRACTION_TEST_TIMEOUT);
});
