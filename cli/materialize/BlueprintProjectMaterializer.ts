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
    type ProjectMaterializationOptions,
} from "pokie";
import {BlueprintMaterializationError} from "./BlueprintMaterializationError.js";
import {extractNpmStderr, PackageCommandRunning, runPackageCommand} from "../prepare/PackageCommandRunner.js";

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

// A cache materialization is the user-facing boundary behind Studio's one-click Create Project flow.
// npm can occasionally reject an otherwise valid local install while its cache or another process is
// momentarily busy. Retry that install once in the same disposable staging directory before reporting a
// failure; a permanent dependency error still surfaces with npm's final diagnostic.
const DEPENDENCY_INSTALL_ATTEMPTS = 2;

// Written into a freshly claimed `<cacheDir>.lock` directory, immediately after the `mkdir` that claims it --
// records which OS process is holding this cache key's lock so a *later* contender can tell an actively-held
// lock (holder's pid still alive: keep waiting, never touch it) apart from an abandoned one (holder's pid is
// gone -- it crashed, was killed, or otherwise exited without ever reaching releaseLock()): only the latter is
// ever safe to reclaim. See acquireLock()'s own doc comment for why pid liveness, specifically, is what makes
// that distinction safe.
const LOCK_HOLDER_FILE = "holder.json";

type MaterializedMarker = {readonly cacheKey: string};

// "token" uniquely identifies one specific *instance* of holding a cache key's lock -- generated fresh every
// time a call becomes a holder, whether via the initial `mkdir` win or via reclaiming an abandoned lock (see
// acquireLock()'s own doc comment). It's what lets releaseLock() tell "the lock currently at lockDir is still
// the exact instance this call acquired" apart from "lockDir now belongs to an entirely different holder" --
// a distinction pid alone can't make (a reclaim can, in the failure case its own doc comment describes,
// leave this call's instance sitting in a private quarantine copy while lockDir itself has since been
// claimed fresh by someone else with a different token but, coincidentally or not, any pid). Optional only so
// a holder record written by an older/foreign format (no "token" field) still parses as a value with no token
// -- readHolder() itself never treats that as invalid, but any ownership-equality check against it correctly
// always fails, since a real token is never undefined.
type LockHolder = {readonly pid: number; readonly token?: string};

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
// understands ever changes), and the running installation identity (changes when an unpublished/local build is
// replaced without a version bump) — so an unchanged blueprint against an unchanged "pokie" always resolves to the
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
    private readonly runtimeIdentity: string;

    constructor(
        pokieVersion: string,
        generator: GamePackageGenerating = new GamePackageGenerator(pokieVersion),
        validator: GameBlueprintValidating = new GameBlueprintValidator(),
        loadBlueprint: (filePath: string) => unknown = loadGameBlueprint,
        runCommand: PackageCommandRunning = runPackageCommand,
        packageValidator: PokieGamePackageValidating = new PokieGamePackageValidator(),
        cacheRoot: string = DEFAULT_CACHE_ROOT,
        runtimeIdentity: string = pokieVersion,
    ) {
        this.pokieVersion = pokieVersion;
        this.generator = generator;
        this.validator = validator;
        this.loadBlueprint = loadBlueprint;
        this.runCommand = runCommand;
        this.packageValidator = packageValidator;
        this.cacheRoot = cacheRoot;
        this.runtimeIdentity = runtimeIdentity;
    }

    public async materialize(project: PokieProject, options: ProjectMaterializationOptions = {}): Promise<ProjectMaterializationResult> {
        this.assertNotCancelled(options.signal);
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
        this.assertNotCancelled(options.signal);
        const cacheKey = this.computeCacheKey(blueprint, options.cacheIdentity);
        const cacheDir = path.join(this.cacheRoot, cacheKey);

        if (await this.isReady(cacheDir, cacheKey)) {
            // `isReady` performs asynchronous filesystem I/O. A request may
            // have been cancelled while the marker was being read, so never
            // hand its borrowed runtime back without observing that race.
            this.assertNotCancelled(options.signal);
            return this.borrowed(cacheDir);
        }

        return this.materializeUnderLock(blueprint, project.rootPath, cacheDir, cacheKey, options.signal);
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
        signal?: AbortSignal,
    ): Promise<ProjectMaterializationResult> {
        // Must exist before acquireLock() below can even attempt `mkdir(lockDir)` -- otherwise a
        // never-yet-used cacheRoot would fail that `mkdir` with ENOENT (no such parent directory), not the
        // EEXIST acquireLock() actually knows how to retry on.
        fs.mkdirSync(this.cacheRoot, {recursive: true});
        const lockDir = `${cacheDir}.lock`;
        const lockToken = await this.acquireLock(lockDir, signal);
        try {
            this.assertNotCancelled(signal);
            if (await this.isReady(cacheDir, cacheKey)) {
                // As above, cancellation may win while the post-lock cache
                // verification is awaiting the marker read.
                this.assertNotCancelled(signal);
                // Whoever held the lock immediately before us already published a ready, matching entry --
                // borrow it; this call never evicts, renames, or otherwise touches cacheDir.
                return this.borrowed(cacheDir);
            }

            await this.evictStale(cacheDir);

            const stagingDir = path.join(this.cacheRoot, `${cacheKey}.staging-${crypto.randomBytes(8).toString("hex")}`);
            try {
                this.assertNotCancelled(signal);
                this.runGeneratePhase(blueprint, stagingDir);
                this.assertNotCancelled(signal);
                await this.runDependenciesPhase(stagingDir, signal);
                this.assertNotCancelled(signal);
                await this.runVerifyPhase(stagingDir, blueprintPath);
                this.assertNotCancelled(signal);
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
            await this.releaseLock(lockDir, lockToken);
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

    private computeCacheKey(blueprint: GameBlueprint, cacheIdentity?: string): string {
        const raw =
            `blueprintHash:${computeGameBlueprintHash(blueprint)}|` +
            `pokieVersion:${this.pokieVersion}|` +
            `buildContractVersion:${GAME_BLUEPRINT_SCHEMA_VERSION}|` +
            `runtimeIdentity:${this.runtimeIdentity}|` +
            `sourceIdentity:${cacheIdentity ?? "blueprint"}`;
        return crypto.createHash("sha256").update(raw).digest("hex");
    }

    private runGeneratePhase(blueprint: GameBlueprint, stagingDir: string): void {
        try {
            this.generator.generate(blueprint, path.dirname(stagingDir), path.basename(stagingDir));
        } catch (error) {
            throw new BlueprintMaterializationError("generate", error instanceof Error ? error.message : String(error));
        }
    }

    private async runDependenciesPhase(stagingDir: string, signal?: AbortSignal): Promise<void> {
        let lastError: unknown;
        for (let attempt = 1; attempt <= DEPENDENCY_INSTALL_ATTEMPTS; attempt++) {
            // A command aborted while npm is active rejects below. Check both
            // before starting an attempt and before considering a retry, so a
            // cancellation can never launch a second dependency install.
            this.assertNotCancelled(signal);
            try {
                // "--omit=dev": a staged runtime's dist/index.js is already generated here (never compiled --
                // see this class's own doc comment), so its devDependencies (e.g. "typescript") are never
                // actually needed. Skipping them is also what makes this install genuinely offline end to end
                // when composed with withLocalPokieInstall's own dependency-closure rewrite (see
                // PackageCommandRunner.ts): a real running POKIE installation that isn't a dev checkout (e.g.
                // "npm install -g pokie") never has its own devDependencies installed either, so there'd be
                // nothing on disk for that mechanism to point "typescript" at anyway.
                await this.runCommand("npm", ["install", "--omit=dev"], stagingDir, {signal});
                return;
            } catch (error) {
                lastError = error;
                this.assertNotCancelled(signal);
            }
        }
        // The only exit after every bounded install attempt has failed is the materialization boundary --
        // never the runner's arbitrary rejection shape. materializeUnderLock() then removes this call's
        // disposable staging directory before releasing the cache-key lock, so a later caller starts fresh.
        throw new BlueprintMaterializationError(
            "dependencies",
            `Could not install this Blueprint's runtime dependencies in "${stagingDir}". This is usually a local ` +
                "npm or network problem, not a problem with the Blueprint itself -- see this error's own \"details\" " +
                "for the exact npm output.",
            extractNpmStderr(lastError) ?? (lastError instanceof Error ? lastError.message : String(lastError)),
        );
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
    // Returns the token (see LockHolder's own doc comment) this specific call now owns for `lockDir`'s cache
    // key -- releaseLock() must be given this exact value back, never inferred, so it can tell its own lock
    // instance apart from a later holder's (see releaseLock()'s own doc comment on why that distinction is
    // "ownership-aware" rather than a blind path-based delete).
    // Compatibility shape: private async acquireLock(lockDir: string) remains
    // the no-cancellation form; runtime callers additionally pass their
    // operation signal while waiting for the same lock.
    private async acquireLock(lockDir: string, signal?: AbortSignal): Promise<string> {
        for (;;) {
            this.assertNotCancelled(signal);
            const token = crypto.randomBytes(16).toString("hex");
            try {
                await fs.promises.mkdir(lockDir);
                this.writeHolder(lockDir, token);
                return token;
            } catch (error) {
                if ((error as NodeJS.ErrnoException)?.code !== "EEXIST") {
                    throw error;
                }
            }
            // Opportunistic, best-effort: a prior reclaim attempt against *this* lockDir may have quarantined
            // an active lock whose handback then lost the race to whichever holder occupies lockDir right
            // now (see reclaimAbandonedLock()'s own doc comment) -- if that displaced holder has itself since
            // died without ever reaching its own releaseLock(), nothing else will ever notice, since nothing
            // else ever looks at a `.reclaim-*` path. Sweeping it here, on every contended retry against the
            // same lockDir, is what keeps that case from becoming permanent disk debris.
            await this.sweepAbandonedQuarantine(lockDir);
            if (await this.isLockAbandoned(lockDir)) {
                await this.reclaimAbandonedLock(lockDir);
                continue;
            }
            await this.delay(LOCK_RETRY_DELAY_MS);
        }
    }

    private writeHolder(lockDir: string, token: string): void {
        const holder: LockHolder = {pid: process.pid, token};
        fs.writeFileSync(path.join(lockDir, LOCK_HOLDER_FILE), JSON.stringify(holder));
    }

    // Reads whatever holder record currently lives at `holderPath`, or null if there isn't one (not yet
    // written, already removed, or unparseable) -- never throws. Only "pid" is required for a value to come
    // back non-null; "token" is read through verbatim when present (see LockHolder's own doc comment on why
    // an absent token is a valid, distinct value from any real one, never coerced or defaulted).
    private async readHolder(holderPath: string): Promise<LockHolder | null> {
        let raw: string;
        try {
            raw = await fs.promises.readFile(holderPath, "utf-8");
        } catch {
            return null;
        }
        try {
            const holder = JSON.parse(raw) as Partial<LockHolder>;
            return typeof holder.pid === "number" ? {pid: holder.pid, token: holder.token} : null;
        } catch {
            return null;
        }
    }

    // True only when `lockDir` unambiguously belongs to a process that is no longer running -- never on
    // uncertainty. A holder file that hasn't appeared yet (its owner is mid-`mkdir`-then-write, or the lock
    // was released in the instant between our failed `mkdir` and this read) reads as "not abandoned": the
    // next loop iteration's `mkdir` attempt will observe whichever of those is actually true. This is what
    // keeps a genuinely active holder from ever being reclaimed or interrupted.
    private async isLockAbandoned(lockDir: string): Promise<boolean> {
        const holder = await this.readHolder(path.join(lockDir, LOCK_HOLDER_FILE));
        return holder !== null && !this.isProcessAlive(holder.pid);
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
    //     If that hand-back itself loses a race (lockDir claimed *again* by yet another, later contender in
    //     the interim), the displaced holder is never discarded to make room -- see the inline comment on
    //     that branch below for how it's still guaranteed to get cleaned up without ever being destroyed. Only
    //     an EEXIST or ENOTEMPTY from that rename means lockDir is genuinely occupied by such a later
    //     contender -- a directory `rename` onto an existing, non-empty directory fails with ENOTEMPTY on
    //     Linux and EEXIST on other platforms, and a later contender's lockDir always holds at least its own
    //     holder file, so it is never empty. Any other failure (e.g. a permissions problem) is not a collision
    //     and must never be treated like one -- it is thrown instead, so a non-contention handback failure can
    //     never silently leave the active holder stranded in quarantine while acquisition proceeds as if the
    //     lock were free.
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
        } catch (error) {
            const code = (error as NodeJS.ErrnoException)?.code;
            if (code !== "EEXIST" && code !== "ENOTEMPTY") {
                throw new BlueprintMaterializationError(
                    "lock",
                    `Active materialization lock "${lockDir}" could not be restored after quarantine: ${error instanceof Error ? error.message : String(error)}. ` +
                        "Remove any stray quarantine directory manually before retrying.",
                );
            }
            // lockDir was claimed by a different, later contender while this call held the quarantine copy
            // pending verification -- the active holder inside it can no longer be handed back to its
            // expected path. It is left exactly where it is, never discarded: quarantineDir is a private path
            // nothing else ever looks at, so leaving it in place can never be observed as, or confused with,
            // a real lock by anyone else. That holder's own eventual releaseLock() call still finds and
            // removes this exact copy (see releaseLock()'s own doc comment on cleanupOwnQuarantineCopy()); if
            // it instead dies without ever releasing, a later contender's sweepAbandonedQuarantine() reclaims
            // it once it's independently confirmed dead. This call itself never touches lockDir again, which
            // by now unambiguously belongs to that later contender.
        }
    }

    // Ownership-aware: only ever removes `lockDir` outright when it still records *this exact* lock instance
    // (matched by `token`, not just pid -- see LockHolder's own doc comment on why pid alone can't make this
    // distinction). A mismatch means lockDir now belongs to a different, later holder -- most likely because
    // this call's own lock was displaced into a private quarantine copy by another contender's failed
    // reclaim-handback (see reclaimAbandonedLock()'s own doc comment) rather than ever actually being
    // reclaimed or genuinely released. Either way, lockDir itself is never touched in that case: doing so
    // would delete a holder this call never owned. Instead this cleans up its own quarantine copy, if one
    // exists, so an earlier holder's release still leaves no trace behind without ever disturbing whoever
    // holds lockDir now.
    private async releaseLock(lockDir: string, token: string): Promise<void> {
        const holder = await this.readHolder(path.join(lockDir, LOCK_HOLDER_FILE));
        if (holder !== null && holder.token === token) {
            await this.removeBestEffort(lockDir);
            return;
        }
        await this.cleanupOwnQuarantineCopy(lockDir, token);
    }

    // Finds and removes the one quarantine copy under lockDir's own `.reclaim-` prefix (if any) whose
    // recorded token matches `token` -- i.e. this call's own displaced lock instance, never anyone else's.
    private async cleanupOwnQuarantineCopy(lockDir: string, token: string): Promise<void> {
        for (const quarantineDir of await this.listQuarantineSiblings(lockDir)) {
            const holder = await this.readHolder(path.join(quarantineDir, LOCK_HOLDER_FILE));
            if (holder !== null && holder.token === token) {
                await this.removeBestEffort(quarantineDir);
                return;
            }
        }
    }

    // Opportunistic, best-effort cleanup of quarantine copies whose own recorded holder is independently
    // confirmed dead -- see acquireLock()'s own doc comment on when and why this runs. Never removes a
    // quarantine copy holding a still-live (merely displaced) lock; that one is left for
    // cleanupOwnQuarantineCopy() to find once its rightful holder actually releases.
    private async sweepAbandonedQuarantine(lockDir: string): Promise<void> {
        for (const quarantineDir of await this.listQuarantineSiblings(lockDir)) {
            if (await this.isLockAbandoned(quarantineDir)) {
                await this.removeBestEffort(quarantineDir);
            }
        }
    }

    private async listQuarantineSiblings(lockDir: string): Promise<string[]> {
        const prefix = `${path.basename(lockDir)}.reclaim-`;
        let entries: string[];
        try {
            entries = await fs.promises.readdir(path.dirname(lockDir));
        } catch {
            return [];
        }
        return entries.filter((entry) => entry.startsWith(prefix)).map((entry) => path.join(path.dirname(lockDir), entry));
    }

    private assertNotCancelled(signal: AbortSignal | undefined): void {
        if (signal?.aborted) throw new Error("Runtime materialization was cancelled.");
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
