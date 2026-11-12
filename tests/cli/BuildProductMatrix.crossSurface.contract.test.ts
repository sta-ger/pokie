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

// Each public operation owns a fresh source and drains its native package snapshots.
// Keep the existing bound; unrelated operations must not share one cumulative deadline.
const MATRIX_LIFECYCLE_TEST_TIMEOUT = 2 * PACKAGE_EXTRACTION_TEST_TIMEOUT;

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
    let restoreTemporaryDirectory: (() => void) | undefined;
    let runtimeFixture: string;
    beforeAll(() => {
        restoreTemporaryDirectory = createPackageExtractionTestEnvironment({stageRuntime: false});
        // This suite already supplies its runtime below; staging a second, unused
        // compiled package duplicates setup and filesystem pressure in the gate.
        runtimeFixture = path.join(os.tmpdir(), "matrix-source-runtime");
        createMatrixRuntimeFixture(runtimeFixture);
    });
    afterAll(() => {
        restoreTemporaryDirectory?.();
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
        try {
            // The suite owns this temporary root, including all nested native loaders.
            // A resolved publication/cancellation must also have released its leases.
            expect(fs.readdirSync(os.tmpdir()).filter(name => name.startsWith("pokie-runtime-"))).toEqual([]);
        } finally {
            logSpy.mockRestore();
            fs.rmSync(workDir, {recursive: true, force: true});
        }
    });

    it("admits the complete V2C-31 and V2C-37 repairs in both candidate readers while protecting product inputs and pins", async () => {
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
        const fixture = await load("tests/testUtils/createP911CandidateFixture.mjs") as {P911_TOOLING_DESCENDANT_PATHS: string[]; V2C37_SAVED_GATE_CORRECTION_PATHS: string[]};
        // Independent of either reader's admission list: this is the complete delta since the
        // authenticated installed candidate, including these readers and their regression fixture.
        const repairPaths = [...new Set([
            ...fixture.V2C37_SAVED_GATE_CORRECTION_PATHS,
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
        ])];
        expect(fixture.V2C37_SAVED_GATE_CORRECTION_PATHS).toEqual(expect.arrayContaining([
            "tests/cli/BuildProductMatrix.crossSurface.contract.test.ts",
            "tests/scripts/p8-05-product-readiness-campaign.test.mjs",
            "tests/v2/FeatureAnalyticsPublic.test.ts",
            "tests/v2/TransactionalRuntimeBoundary.test.ts",
            "tests/testUtils/stageCompiledTestRuntime.ts",
            "tests/v2/helpers/publicRuntime.ts",
        ]));
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

    // listTargets prepares six real downstream plans, each with private native
    // package acquisition/cleanup. Retained phase timings charged 90-118 seconds
    // to this readback alone. Give that operation its own fixture and deadline;
    // the conversion lifecycle below keeps every positive/negative assertion.
    it.each(SUPPORTED_CELLS)("reads $source -> $target through next Studio target planning", async ({source, target}) => {
        const fixtureRoot = path.join(workDir, `${source}-${target}`);
        const sourcePath = await createSource(source, fixtureRoot, resolver, registry);
        const sourceProject = await resolveRequired(resolver, sourcePath);
        const output = path.join(fixtureRoot, `next-${target}${targetExtension(target)}`);
        await registry.build(target, sourceProject, output);
        await expect(resolver.resolve(output)).resolves.toMatchObject({type: target, rootPath: output});
        const startedAt = performance.now();
        expect(await studio.listTargets(output)).toEqual(expect.arrayContaining([
            expect.objectContaining({target, supported: BUILD_PRODUCT_MATRIX[target][target].state === "supported"}),
        ]));
        process.stderr.write(`MATRIX_PHASE ${source}->${target} next-studio-plans-and-drain ${Math.round(performance.now() - startedAt)}ms\n`);
    }, MATRIX_LIFECYCLE_TEST_TIMEOUT);

    // A native read copies the full runtime/dependency graph. Retained completed phase
    // timings exceed 100 seconds for individual public operations under filesystem
    // contention. Accumulating every operation in one row caused Jest to advance to
    // the next row while the timed-out row still owned work. These scenarios keep
    // the real readers/builders and every assertion, with independent sources so
    // managed Outcome Library reuse cannot bypass an intended publication or error.
    const operations = ["default CLI and registry", "explicit CLI", "Studio publication", "dry-run", "occupied destination", "unsafe destinations", "cancellation"] as const;
    const lifecycleCases = SUPPORTED_CELLS.flatMap(cell => operations.map(operation => ({...cell, operation})));
    it.each(lifecycleCases)("runs $source -> $target: $operation", async ({source, target, operation}) => {
        const startedAt = performance.now();
        const fixtureRoot = path.join(workDir, `${source}-${target}`);
        const sourcePath = await createSource(source, fixtureRoot, resolver, registry);
        const command = new BuildCommand("1.3.0", undefined, undefined, resolver, registry);

        switch (operation) {
            case "default CLI and registry": {
                const sourceProject = await resolveRequired(resolver, sourcePath);
                // The registry's public matrix answer gates both higher-level callers.
                expect(registry.supportsConversionFrom(target, source)).toBe(true);
                expect(await registry.validate(target, sourceProject)).toBeUndefined();
                const defaultOut = defaultDestination(sourcePath, target);
                expect(await command.run([sourcePath, "--target", target])).toBe(0);
                expect(fs.existsSync(defaultOut)).toBe(true);
                await expect(resolver.resolve(defaultOut)).resolves.toMatchObject({type: target, rootPath: defaultOut});
                break;
            }
            case "explicit CLI": {
                const explicitOut = path.join(fixtureRoot, `explicit-${target}${targetExtension(target)}`);
                expect(await command.run([sourcePath, "--target", target, "--out", explicitOut])).toBe(0);
                expect(fs.existsSync(explicitOut)).toBe(true);
                break;
            }
            case "Studio publication": {
                const studioOut = path.join(fixtureRoot, `studio-${target}${targetExtension(target)}`);
                await expect(studio.build(sourcePath, target, studioOut)).resolves.toMatchObject({
                    status: "ok",
                    target,
                    outputPath: studioOut,
                    sourceType: source,
                });
                expect(fs.existsSync(studioOut)).toBe(true);
                break;
            }
            case "dry-run": {
                const dryRunOut = path.join(fixtureRoot, `dry-run-${target}${targetExtension(target)}`);
                expect(await command.run([sourcePath, "--target", target, "--out", dryRunOut, "--dry-run"])).toBe(0);
                expect(fs.existsSync(dryRunOut)).toBe(false);
                break;
            }
            case "occupied destination": {
                const occupiedOut = path.join(fixtureRoot, `occupied-${target}${targetExtension(target)}`);
                if (["blueprint", "parWorkbook", "wasm"].includes(target)) {
                    fs.writeFileSync(occupiedOut, "preserve me");
                } else {
                    fs.mkdirSync(occupiedOut);
                    fs.writeFileSync(path.join(occupiedOut, "preserve-me.txt"), "preserve me");
                }
                await expect(command.run([sourcePath, "--target", target, "--out", occupiedOut])).rejects.toThrow(
                    new RegExp(`Cannot build target "${target}".*Next: choose a different --out path`, "s"),
                );
                await expect(studio.build(sourcePath, target, occupiedOut)).resolves.toMatchObject({status: "conflict", target});
                expect(["blueprint", "parWorkbook", "wasm"].includes(target) ? fs.readFileSync(occupiedOut, "utf-8") : fs.readFileSync(path.join(occupiedOut, "preserve-me.txt"), "utf-8")).toBe("preserve me");
                break;
            }
            case "unsafe destinations": {
                // Both the literal source and a filesystem alias are forbidden destinations.
                await expect(command.run([sourcePath, "--target", target, "--out", sourcePath])).rejects.toThrow(/source|same|inside|destination/i);
                const sourceAlias = `${sourcePath}-alias`;
                fs.symlinkSync(sourcePath, sourceAlias, fs.statSync(sourcePath).isDirectory() ? "dir" : "file");
                await expect(command.run([sourcePath, "--target", target, "--out", sourceAlias])).rejects.toThrow(/source|same|inside|destination/i);
                break;
            }
            case "cancellation": {
                // Abort only after the production builder reports progress; no partial publication.
                const cleanupOut = path.join(fixtureRoot, `cleanup-${target}${targetExtension(target)}`);
                const controller = new AbortController();
                const cleanup = await studio.build(sourcePath, target, cleanupOut, {
                    signal: controller.signal,
                    onProgress: () => controller.abort(),
                });
                expect(cleanup).toMatchObject({status: "cancelled"});
                expect(fs.existsSync(cleanupOut)).toBe(false);
                break;
            }
        }
        process.stderr.write(`MATRIX_PHASE ${source}->${target} ${operation}-and-drain ${Math.round(performance.now() - startedAt)}ms\n`);
    }, MATRIX_LIFECYCLE_TEST_TIMEOUT);
});
