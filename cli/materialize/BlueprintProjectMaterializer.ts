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

// How long a contender waits, between `mkdir` retries, for another caller's per-cache-key lock (see
// acquireLock()) to be released. Only affects how promptly a *blocked* contender notices the lock is free --
// never correctness: whoever eventually acquires the lock always re-checks readiness before acting.
const LOCK_RETRY_DELAY_MS = 15;

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
// fully populated and already-verified, never partially written. A cache directory found without a matching
// marker (e.g. a prior process crashed between claiming it and writing the marker) is never trusted or
// served -- it's evicted and rebuilt.
//
// Stale-cache recovery (evicting a marker-less/mismatched cacheDir and rebuilding it) is serialized per
// cache key by a filesystem mutex directory (`<cacheDir>.lock`), across every real, separate materialize()
// caller -- not just promises racing in one process. Only the caller holding that lock for a given cache key
// may ever evict or claim its cacheDir, and it always re-observes readiness *after* acquiring the lock,
// never before -- so it can never evict or rename a cacheDir that's since become ready underneath it. Every
// other contender simply blocks until the lock is free, then re-checks reality: ready by then, it borrows
// the winner's entry untouched; still stale, it becomes the new owner (see materializeUnderLock()'s own doc
// comment). A cache entry that's ever been published as ready is therefore never renamed, removed, or even
// briefly absent again -- unlike a bare "check readiness, then delete", which a concurrent claimant could
// always outrun.
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

        if (await this.isReady(cacheDir, cacheKey)) {
            return this.borrowed(cacheDir);
        }

        return this.materializeUnderLock(blueprint, project.rootPath, cacheDir, cacheKey);
    }

    // Owns every stale-cache eviction and fresh claim for `cacheKey`, but only for as long as this call
    // holds `<cacheDir>.lock` -- acquireLock() blocks until no other caller anywhere (this process or
    // another) holds it. The re-check of isReady() immediately below is the reason this is safe: it runs
    // strictly *after* acquiring exclusive ownership, so unlike the initial, lock-free check in
    // materialize(), it can never be stale by the time this call acts on it -- nobody else can be
    // concurrently building or claiming this same cacheKey while the lock is held. That's what lets
    // evictStale() below safely discard whatever's at cacheDir on a "not ready" verdict: it's guaranteed to
    // still be genuinely stale, never a winner's entry this call raced past.
    private async materializeUnderLock(
        blueprint: GameBlueprint,
        blueprintPath: string,
        cacheDir: string,
        cacheKey: string,
    ): Promise<ProjectMaterializationResult> {
        // Must exist before acquireLock() below can even attempt `mkdir(lockDir)` -- otherwise a
        // never-yet-used cacheRoot would fail that `mkdir` with ENOENT (no such parent directory), not the
        // EEXIST acquireLock() actually knows how to retry on.
        fs.mkdirSync(this.cacheRoot, {recursive: true});
        const lockDir = `${cacheDir}.lock`;
        await this.acquireLock(lockDir);
        try {
            if (await this.isReady(cacheDir, cacheKey)) {
                // Whoever held the lock immediately before us already published a ready, matching entry --
                // borrow it; this call never evicts, renames, or otherwise touches cacheDir.
                return this.borrowed(cacheDir);
            }

            await this.evictStale(cacheDir);

            const stagingDir = path.join(this.cacheRoot, `${cacheKey}.staging-${crypto.randomBytes(8).toString("hex")}`);
            try {
                this.runGeneratePhase(blueprint, stagingDir);
                await this.runDependenciesPhase(stagingDir);
                await this.runVerifyPhase(stagingDir, blueprintPath);
                this.markReady(stagingDir, cacheKey);
                // Safe as a plain rename (no occupied-directory handling needed): this call holds
                // exclusive ownership of cacheKey, and evictStale() above already guaranteed cacheDir is
                // absent -- nobody else can have repopulated it while the lock is held.
                await fs.promises.rename(stagingDir, cacheDir);
            } catch (error) {
                await this.removeBestEffort(stagingDir);
                throw error;
            }

            return this.borrowed(cacheDir);
        } finally {
            await this.releaseLock(lockDir);
        }
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

    // Blocks until this process holds exclusive claim/cleanup ownership of `lockDir`'s cache key -- a
    // directory `mkdir` is atomic (across processes, not just promises in one), so exactly one caller
    // anywhere ever wins a given attempt; every other contender just retries after a short delay against
    // whatever the winner leaves behind (ready, and this contender borrows it; released and still stale,
    // and this contender becomes the new owner -- see materializeUnderLock()'s own doc comment).
    private async acquireLock(lockDir: string): Promise<void> {
        for (;;) {
            try {
                await fs.promises.mkdir(lockDir);
                return;
            } catch (error) {
                if ((error as NodeJS.ErrnoException)?.code !== "EEXIST") {
                    throw error;
                }
            }
            await this.delay(LOCK_RETRY_DELAY_MS);
        }
    }

    private async releaseLock(lockDir: string): Promise<void> {
        await this.removeBestEffort(lockDir);
    }

    private delay(ms: number): Promise<void> {
        return new Promise((resolve) => {
            setTimeout(resolve, ms);
        });
    }

    // Only ever called while this cache key's lock is held, immediately after re-confirming `cacheDir` is
    // not ready -- so whatever's there (a marker-less leftover from a crashed build, a mismatched-key entry,
    // or nothing at all) is guaranteed genuinely stale, never a concurrent winner's entry, and a plain
    // recursive remove (not a rename-to-evict dance) is safe.
    private async evictStale(cacheDir: string): Promise<void> {
        await this.removeBestEffort(cacheDir);
    }

    private async isReady(cacheDir: string, cacheKey: string): Promise<boolean> {
        const markerPath = path.join(cacheDir, MATERIALIZED_MARKER_FILE);
        let raw: string;
        try {
            raw = await fs.promises.readFile(markerPath, "utf-8");
        } catch {
            return false;
        }
        try {
            const marker = JSON.parse(raw) as Partial<MaterializedMarker>;
            return marker.cacheKey === cacheKey;
        } catch {
            return false;
        }
    }

    private async removeBestEffort(targetPath: string): Promise<void> {
        try {
            await fs.promises.rm(targetPath, {recursive: true, force: true});
        } catch {
            // best-effort only -- a leftover staging directory or lock under the cache root is never served
            // as a result (see isReady/materializeUnderLock above), just wasted disk until the next cleanup.
        }
    }

    private borrowed(runtimePath: string): ProjectMaterializationResult {
        return {runtimePath, ownsRuntimePath: false, release: () => Promise.resolve()};
    }
}
