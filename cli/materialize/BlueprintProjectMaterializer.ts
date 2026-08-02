import crypto from "crypto";
import fs from "fs";
import os from "os";
import path from "path";
import {
    computeGameBlueprintHash,
    GAME_BLUEPRINT_SCHEMA_VERSION,
    GameBlueprint,
    GameBlueprintValidating,
    GameBlueprintValidator,
    GamePackageGenerating,
    GamePackageGenerator,
    loadGameBlueprint,
    PokieGamePackageValidating,
    PokieGamePackageValidator,
    PokieProject,
    ProjectMaterializationResult,
    ProjectMaterializing,
} from "pokie";
import {BlueprintMaterializationError} from "./BlueprintMaterializationError.js";
import {PackageCommandRunning, runPackageCommand} from "../prepare/PackageCommandRunner.js";

// Where every BlueprintProjectMaterializer defaults to caching a materialized runtime -- a machine-wide,
// process-external location, deliberately never inside the blueprint's own directory or the caller's cwd
// (see this class's own doc comment for why "no user-directory artifacts" matters).
const DEFAULT_CACHE_ROOT = path.join(os.tmpdir(), "pokie-materialize-cache");

// Written into a cache entry only once every phase below has completed -- its presence (with a matching
// "cacheKey") is what tells a later materialize() call, or a concurrent one racing this one, that this exact
// directory is a complete, verified runtime it can borrow rather than a partial/stale one it must rebuild or
// discard. Never "pokie.entry"/"package.json" alone: those are written by GamePackageGenerator itself as part
// of "generate", well before "dependencies"/"verify" have run.
const MATERIALIZED_MARKER_FILE = ".pokie-materialized.json";

type MaterializedMarker = {readonly cacheKey: string};

// The concrete ProjectMaterializing for "blueprint" (and, trivially, "tsPackage") PokieProjects -- the
// implementation ProjectMaterializing.ts was left contract-only in P3-POLISH-02. Turns a blueprint source
// file into the exact same real, loadable runtime "pokie build" itself produces (GamePackageGenerator -- never
// a simplified/in-memory blueprint interpreter), then a real "npm install" so its "require(\"pokie\")" actually
// resolves, then verifies it the same way "pokie validate" does (PokieGamePackageValidator) -- so a caller
// materializing a blueprint for sim/play/dev/serve/replay always gets the real runtime, indistinguishable from
// one produced by "pokie build" + "npm install" by hand.
//
// Cached, deterministically, by content: the cache key folds together the blueprint's own exact-content hash
// (computeGameBlueprintHash — changes on any edit), the running "pokie" version (changes on an upgrade), and
// the blueprint schema/build-contract version (GAME_BLUEPRINT_SCHEMA_VERSION — changes if the shape a build
// understands ever changes) — so an unchanged blueprint against an unchanged "pokie" always resolves to the
// same cache directory (no rebuild, no re-install), while an edit or a version bump always resolves to a
// *different* one (never silently served a stale result; the old entry is simply orphaned, never reused).
//
// Every build first lands in a uniquely-named staging directory beside the cache root and is only ever
// claimed into its final, deterministic `<cacheRoot>/<cacheKey>` location by a single atomic directory
// rename once "verify" has already succeeded — so a reader can only ever observe that final path missing, or
// fully populated and already-verified, never partially written. Two materialize() calls racing for the same
// still-missing cache key each build their own staging copy independently and both attempt the same rename;
// whichever loses discards its own (redundant, already-real) build and borrows the winner's instead — so
// concurrent materialization of the same blueprint never corrupts, and never doubles work observably. A cache
// directory found without a matching marker (e.g. a prior process crashed between claiming it and writing the
// marker) is never trusted or served -- it's removed and rebuilt.
export class BlueprintProjectMaterializer implements ProjectMaterializing {
    private readonly pokieVersion: string;
    private readonly generator: GamePackageGenerating;
    private readonly validator: GameBlueprintValidating;
    private readonly loadBlueprint: (filePath: string) => unknown;
    private readonly runCommand: PackageCommandRunning;
    private readonly packageValidator: PokieGamePackageValidating;
    private readonly cacheRoot: string;

    constructor(
        pokieVersion: string,
        generator: GamePackageGenerating = new GamePackageGenerator(pokieVersion),
        validator: GameBlueprintValidating = new GameBlueprintValidator(),
        loadBlueprint: (filePath: string) => unknown = loadGameBlueprint,
        runCommand: PackageCommandRunning = runPackageCommand,
        packageValidator: PokieGamePackageValidating = new PokieGamePackageValidator(),
        cacheRoot: string = DEFAULT_CACHE_ROOT,
    ) {
        this.pokieVersion = pokieVersion;
        this.generator = generator;
        this.validator = validator;
        this.loadBlueprint = loadBlueprint;
        this.runCommand = runCommand;
        this.packageValidator = packageValidator;
        this.cacheRoot = cacheRoot;
    }

    public async materialize(project: PokieProject): Promise<ProjectMaterializationResult> {
        if (project.type === "tsPackage") {
            // Already runtime-shaped -- nothing to build, nothing new allocated (see
            // ProjectMaterializationResult's own doc comment on "ownsRuntimePath: false").
            return this.borrowed(project.rootPath);
        }
        if (project.type !== "blueprint") {
            throw new Error(
                `BlueprintProjectMaterializer cannot materialize a "${project.type}" project into a runnable runtime -- ` +
                    `only "blueprint" (built fresh) and "tsPackage" (already runtime-shaped) are supported.`,
            );
        }

        const blueprint = this.loadAndValidate(project.rootPath);
        const cacheKey = this.computeCacheKey(blueprint);
        const cacheDir = path.join(this.cacheRoot, cacheKey);

        if (this.isReady(cacheDir, cacheKey)) {
            return this.borrowed(cacheDir);
        }

        fs.mkdirSync(this.cacheRoot, {recursive: true});
        const stagingDir = path.join(this.cacheRoot, `${cacheKey}.staging-${crypto.randomBytes(8).toString("hex")}`);

        try {
            this.runGeneratePhase(blueprint, stagingDir);
            await this.runDependenciesPhase(stagingDir);
            await this.runVerifyPhase(stagingDir, project.rootPath);
            this.markReady(stagingDir, cacheKey);
            this.claim(stagingDir, cacheDir, cacheKey);
        } catch (error) {
            this.removeBestEffort(stagingDir);
            throw error;
        }

        return this.borrowed(cacheDir);
    }

    private loadAndValidate(blueprintPath: string): GameBlueprint {
        const raw = this.loadBlueprint(blueprintPath);
        const errors = this.validator.validate(raw).filter((issue) => issue.severity === "error");
        if (errors.length > 0) {
            const details = errors.map((issue) => `  - ${issue.code}: ${issue.message}`).join("\n");
            throw new BlueprintMaterializationError(
                "validate",
                `Blueprint "${blueprintPath}" has ${errors.length} error(s) and cannot be materialized:\n${details}`,
            );
        }
        return raw as GameBlueprint;
    }

    private computeCacheKey(blueprint: GameBlueprint): string {
        const raw =
            `blueprintHash:${computeGameBlueprintHash(blueprint)}|` +
            `pokieVersion:${this.pokieVersion}|` +
            `buildContractVersion:${GAME_BLUEPRINT_SCHEMA_VERSION}`;
        return crypto.createHash("sha256").update(raw).digest("hex");
    }

    private runGeneratePhase(blueprint: GameBlueprint, stagingDir: string): void {
        try {
            this.generator.generate(blueprint, path.dirname(stagingDir), path.basename(stagingDir));
        } catch (error) {
            throw new BlueprintMaterializationError("generate", error instanceof Error ? error.message : String(error));
        }
    }

    private async runDependenciesPhase(stagingDir: string): Promise<void> {
        try {
            await this.runCommand("npm", ["install"], stagingDir);
        } catch (error) {
            const detail = error instanceof Error ? error.message : String(error);
            throw new BlueprintMaterializationError("dependencies", `"npm install" failed in "${stagingDir}": ${detail}`);
        }
    }

    private async runVerifyPhase(stagingDir: string, blueprintPath: string): Promise<void> {
        const report = await this.packageValidator.validate(stagingDir);
        if (report.valid) {
            return;
        }
        const details = report.errors.map((issue) => `  - ${issue.code}: ${issue.message}`).join("\n");
        throw new BlueprintMaterializationError(
            "verify",
            `Blueprint "${blueprintPath}" materialized to "${stagingDir}" but failed verification:\n${details}`,
        );
    }

    private markReady(stagingDir: string, cacheKey: string): void {
        const marker: MaterializedMarker = {cacheKey};
        fs.writeFileSync(path.join(stagingDir, MATERIALIZED_MARKER_FILE), `${JSON.stringify(marker, null, 4)}\n`);
    }

    // Claims `stagingDir` as the cache's own `cacheDir` via a single atomic rename -- the moment this
    // succeeds, `cacheDir` is either still entirely absent to every other reader, or fully populated and
    // already-verified; never partial. If another materialize() call already claimed `cacheDir` first (the
    // rename fails because it's non-empty), and that entry is itself ready, this call's own (redundant, but
    // just as real) build is discarded right here, never left behind as an orphan. If `cacheDir` exists but
    // ISN'T ready (a marker-less leftover from a prior crash), it's never trusted or merged with -- removed
    // and replaced with this call's own freshly-verified build instead.
    private claim(stagingDir: string, cacheDir: string, cacheKey: string): void {
        try {
            fs.renameSync(stagingDir, cacheDir);
            return;
        } catch (error) {
            const code = (error as NodeJS.ErrnoException)?.code;
            if (code !== "ENOTEMPTY" && code !== "EEXIST") {
                throw error;
            }
        }

        if (this.isReady(cacheDir, cacheKey)) {
            // A concurrent materialize() call already built and claimed this exact cache key first --
            // this call's own (redundant, but just as real and valid) build is never left behind as an
            // orphan; only the winner's copy is kept.
            this.removeBestEffort(stagingDir);
            return;
        }

        this.removeBestEffort(cacheDir);
        fs.renameSync(stagingDir, cacheDir);
    }

    private isReady(cacheDir: string, cacheKey: string): boolean {
        const markerPath = path.join(cacheDir, MATERIALIZED_MARKER_FILE);
        if (!fs.existsSync(markerPath)) {
            return false;
        }
        try {
            const marker = JSON.parse(fs.readFileSync(markerPath, "utf-8")) as Partial<MaterializedMarker>;
            return marker.cacheKey === cacheKey;
        } catch {
            return false;
        }
    }

    private removeBestEffort(targetPath: string): void {
        try {
            fs.rmSync(targetPath, {recursive: true, force: true});
        } catch {
            // best-effort only -- a leftover staging directory under the cache root is never served as a
            // result (see isReady/claim above), just wasted disk until the next cleanup.
        }
    }

    private borrowed(runtimePath: string): ProjectMaterializationResult {
        return {runtimePath, ownsRuntimePath: false, release: () => Promise.resolve()};
    }
}
