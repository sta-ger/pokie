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

// Written into a freshly claimed `<cacheDir>.lock` directory, immediately after the `mkdir` that claims it --
// records which OS process is holding this cache key's lock so a *later* contender can tell an actively-held
// lock (holder's pid still alive: keep waiting, never touch it) apart from an abandoned one (holder's pid is
// gone -- it crashed, was killed, or otherwise exited without ever reaching releaseLock()): only the latter is
// ever safe to reclaim. See acquireLock()'s own doc comment for why pid liveness, specifically, is what makes
// that distinction safe.
const LOCK_HOLDER_FILE = "holder.json";

type MaterializedMarker = {readonly cacheKey: string};

type LockHolder = {readonly pid: number};

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
//
// A `<cacheDir>.lock` left behind by a holder that never released it -- a killed or crashed process, a failed
// cleanup -- can never be allowed to block every future caller forever. acquireLock() tells that apart from an
// actively-held lock by the recorded holder's pid liveness (see its own doc comment): still alive, every
// contender just keeps waiting, no matter how long; gone, the next contender to notice reclaims it and
// proceeds exactly as if it had been released normally. A lock that genuinely can't be reclaimed (e.g. a
// filesystem permissions failure) is surfaced as a thrown error, never silently retried forever.
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
    //
    // A lock left behind by a holder that's simply gone -- terminated, killed, or otherwise never reached its
    // own releaseLock() -- must never be allowed to block every future caller forever. Each contender that
    // finds `lockDir` already claimed therefore checks whether its recorded holder pid (LOCK_HOLDER_FILE,
    // written by the winner immediately after its own `mkdir`) is still alive: still alive, this contender
    // just keeps waiting -- an active holder is never reclaimed or interrupted, no matter how long it runs.
    // Gone, this contender reclaims the abandoned lock itself (reclaimAbandonedLock()) and loops back to
    // retry `mkdir`, exactly as if the lock had been released normally. Reclaiming is itself safe to attempt
    // redundantly from multiple contenders at once -- see reclaimAbandonedLock()'s own doc comment -- because
    // the actual exclusivity guarantee always comes from `mkdir`'s atomicity, never from reclaim.
    private async acquireLock(lockDir: string): Promise<void> {
        for (;;) {
            try {
                await fs.promises.mkdir(lockDir);
                fs.writeFileSync(path.join(lockDir, LOCK_HOLDER_FILE), JSON.stringify({pid: process.pid} as LockHolder));
                return;
            } catch (error) {
                if ((error as NodeJS.ErrnoException)?.code !== "EEXIST") {
                    throw error;
                }
            }
            if (await this.isLockAbandoned(lockDir)) {
                await this.reclaimAbandonedLock(lockDir);
                continue;
            }
            await this.delay(LOCK_RETRY_DELAY_MS);
        }
    }

    // True only when `lockDir` unambiguously belongs to a process that is no longer running -- never on
    // uncertainty. A holder file that hasn't appeared yet (its owner is mid-`mkdir`-then-write, or the lock
    // was released in the instant between our failed `mkdir` and this read) reads as "not abandoned": the
    // next loop iteration's `mkdir` attempt will observe whichever of those is actually true. This is what
    // keeps a genuinely active holder from ever being reclaimed or interrupted.
    private async isLockAbandoned(lockDir: string): Promise<boolean> {
        let raw: string;
        try {
            raw = await fs.promises.readFile(path.join(lockDir, LOCK_HOLDER_FILE), "utf-8");
        } catch {
            return false;
        }
        let holder: Partial<LockHolder>;
        try {
            holder = JSON.parse(raw);
        } catch {
            return false;
        }
        return typeof holder.pid === "number" && !this.isProcessAlive(holder.pid);
    }

    // Signaling pid 0 (no-op) is the standard liveness probe: it succeeds iff a process with that pid exists
    // and this process is permitted to signal it. ESRCH ("no such process") is the only answer that means
    // "gone" -- anything else (most commonly EPERM, a process we can see but don't own) means a process is
    // still there, so this defaults to "alive" rather than risk reclaiming a lock out from under it.
    private isProcessAlive(pid: number): boolean {
        try {
            process.kill(pid, 0);
            return true;
        } catch (error) {
            return (error as NodeJS.ErrnoException)?.code !== "ESRCH";
        }
    }

    // Only ever called after isLockAbandoned() has already confirmed `lockDir`'s recorded holder is gone --
    // but that observation can be stale by the time this call actually runs: another contender's own reclaim
    // may already have cleared `lockDir`, and a brand-new contender may have claimed a fresh lock at that
    // exact path in between. A blind `rm(lockDir)` at that point would delete whatever now happens to be
    // there -- including a just-acquired, genuinely active lock -- with no way to tell the two apart.
    //
    // Instead this hands the abandoned lock off through a private quarantine directory, atomically: a
    // directory `rename` is a single filesystem operation that always moves whatever currently occupies
    // `lockDir`, so there is no window between "observe what's there" and "take it" for a fresh claim to
    // slip in unnoticed. Once quarantined -- now at a path unique to this call, so no other contender can be
    // racing it -- its holder is re-checked for liveness one last time, this time under full certainty:
    //   - still abandoned (dead pid): genuinely safe to discard, so this call removes it and returns.
    //   - alive: this call's own abandonment check was already stale by the time its rename ran -- what it
    //     grabbed is a fresh, active lock claimed at this path afterwards. It hands that straight back via a
    //     second rename, restoring the active holder exactly as if this call had never touched `lockDir`.
    //     If that hand-back itself loses a race (lockDir reclaimed *again* by yet another contender in the
    //     interim -- see its own inline comment below), the now-doubly-orphaned quarantine copy is simply
    //     discarded rather than left as permanent disk debris; that holder's own release/reclaim cycle still
    //     recovers cleanly, since every removal here targets a private path, never `lockDir` itself.
    // A lock that's genuinely abandoned but can't actually be reclaimed (e.g. a permissions problem on the
    // cache root) is thrown, never silently retried forever.
    private async reclaimAbandonedLock(lockDir: string): Promise<void> {
        const quarantineDir = `${lockDir}.reclaim-${crypto.randomBytes(8).toString("hex")}`;
        try {
            await fs.promises.rename(lockDir, quarantineDir);
        } catch (error) {
            if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
                // Already gone -- another contender reclaimed (or the holder itself released) this exact
                // lock first. Nothing left for this call to do; the next mkdir retry sees a free path.
                return;
            }
            throw new BlueprintMaterializationError(
                "lock",
                `Abandoned materialization lock "${lockDir}" could not be removed: ${error instanceof Error ? error.message : String(error)}. ` +
                    "Remove it manually before retrying.",
            );
        }

        if (await this.isLockAbandoned(quarantineDir)) {
            await this.removeBestEffort(quarantineDir);
            return;
        }

        try {
            await fs.promises.rename(quarantineDir, lockDir);
        } catch {
            // lockDir was reclaimed again by another contender while this call held the quarantine copy --
            // the active holder it briefly displaced can't be handed back to its expected path anymore.
            // Discarding the orphaned copy here (rather than leaving it as debris) is the only option left;
            // that holder's own eventual release/reclaim cycle is unaffected, since it never touches this
            // private quarantine path.
            await this.removeBestEffort(quarantineDir);
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
