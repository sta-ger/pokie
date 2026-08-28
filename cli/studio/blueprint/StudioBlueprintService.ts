import {
    ArtifactConversionPlanner,
    ArtifactBuildConflictError,
    assertPreparedArtifactDestinationAvailable,
    BLUEPRINT_BUILD_CAPABILITY,
    buildGameBuildInfo,
    buildGameModelProjection,
    computeGameBlueprintHash,
    GameBlueprint,
    GameBlueprintValidating,
    GameBlueprintValidator,
    GameModelProjection,
    GamePackageGenerating,
    GamePackageGenerator,
    loadGameBlueprint,
    ParSheetExporter,
    ParSheetExporting,
    ParSheetImporter,
    ParSheetImporting,
    RandomGameBlueprintGenerating,
    RandomGameBlueprintGenerator,
    RandomGameBlueprintVariantStrategy,
    ReelStrip,
    ReelStripAnalyzer,
    ReelStripGenerationSummary,
    resolveReelStripGeneration,
    SlotGameNameGenerator,
} from "pokie";
import fs from "fs";
import os from "os";
import path from "path";
import {PokiePathResolver} from "../../paths/PokiePathResolver.js";
import {isPathWithin} from "../isPathWithin.js";
import {previewBuildDestination} from "../previewBuildDestination.js";
import type {StudioHomeService} from "../home/StudioHomeService.js";
import type {StudioBuildPreviewView} from "../home/StudioBuildPreviewView.js";
import type {StudioBuildResult} from "../home/StudioBuildResult.js";
import {serializeGameBlueprint} from "./serializeGameBlueprint.js";
import type {StudioBlueprintCheckView} from "./StudioBlueprintCheckView.js";
import type {StudioBlueprintLoadView} from "./StudioBlueprintLoadView.js";
import type {StudioBlueprintRandomView} from "./StudioBlueprintRandomView.js";
import type {StudioBlueprintSaveManagedView} from "./StudioBlueprintSaveManagedView.js";
import type {StudioBlueprintSaveView} from "./StudioBlueprintSaveView.js";
import type {StudioBlueprintValidationView} from "./StudioBlueprintValidationView.js";
import type {StudioParSheetExportView} from "./StudioParSheetExportView.js";
import type {StudioParSheetConversionEvidence, StudioParSheetImportView} from "./StudioParSheetImportView.js";
import type {StudioReelStripGenerationReelView, StudioReelStripGenerationView} from "./StudioReelStripGenerationView.js";

const outsideStudioRootMessage = (rawPath: string): string =>
    `"${rawPath}" resolves inside POKIE Studio's own internal directory and cannot be used as a blueprint path.`;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_SYMBOL_ARTWORK_BYTES = 5 * 1024 * 1024;
const SYMBOL_ARTWORK_DIRECTORY = "assets/symbols";

function symbolArtworkReferences(blueprint: unknown): string[] {
    if (!isPlainObject(blueprint) || !isPlainObject(blueprint.symbolArtwork)) {
        return [];
    }
    return Object.values(blueprint.symbolArtwork).filter((reference): reference is string => typeof reference === "string");
}

function symbolArtwork(blueprint: unknown): Record<string, string> {
    if (!isPlainObject(blueprint) || !isPlainObject(blueprint.symbolArtwork)) return {};
    return Object.fromEntries(Object.entries(blueprint.symbolArtwork).filter((entry): entry is [string, string] => typeof entry[1] === "string" && isSafeSymbolArtworkReference(entry[1])));
}

function isSafeSymbolArtworkReference(reference: string): boolean {
    const normalized = reference.replace(/\\/g, "/");
    return normalized.startsWith(`${SYMBOL_ARTWORK_DIRECTORY}/`) && !normalized.split("/").includes("..");
}

// saveManaged()'s own directory-name policy -- the blueprint's own manifest.id when it's already a
// non-empty string (the same identifier GamePackageCreator/build already treat as this game's own
// identity), falling back to the fixed literal "blueprint" for a draft that hasn't set one yet (a blank
// New-flow start, or a manifest.id GameBlueprintValidator would itself reject) rather than failing the
// save outright -- PokiePathResolver.resolveIndependentProjectDirectory's own "invalid-name" outcome is
// reserved for a name that's unsafe as a directory segment (contains a path separator, is "."/".."), not
// for "not yet a valid game id".
function deriveManagedBlueprintName(blueprint: unknown): string {
    if (isPlainObject(blueprint) && isPlainObject(blueprint.manifest) && typeof blueprint.manifest.id === "string") {
        const trimmedId = blueprint.manifest.id.trim();
        if (trimmedId.length > 0) {
            return trimmedId;
        }
    }
    return "blueprint";
}

// A brand-new guided session's first Save must never silently clobber a *different*, already-existing
// managed Blueprint Project that just happens to share its manifest.id -- two "New Design Game" sessions
// started from the same starter preset (or a hand-typed id collision) are exactly the case this guards.
// Rather than asking the user to pick a different id (breaking saveManaged()'s whole "never has to ask"
// contract), this deterministically walks "<name>", "<name>-2", "<name>-3", ... and takes the first
// candidate whose managed blueprint.json doesn't exist yet -- the same numeric-suffix convention a
// filesystem's own "Copy" / "Save As" dialog already uses, so a user who does notice the name (in the
// Projects tab, or a later Save As) recognizes it immediately as "the same idea, a different slot".
// Deliberately keyed off the target *file's* existence, not the directory's: a directory that already
// exists but has no blueprint.json yet (created for some other reason) is not a collision.
const MAX_MANAGED_DESTINATION_ATTEMPTS = 1000;

type ManagedDestination =
    | {readonly status: "valid"; readonly directory: string; readonly targetPath: string; readonly name: string}
    | {readonly status: "invalid-name" | "unavailable"; readonly message: string};

function resolveAvailableManagedDestination(pathResolver: PokiePathResolver, baseName: string): ManagedDestination {
    for (let attempt = 1; attempt <= MAX_MANAGED_DESTINATION_ATTEMPTS; attempt++) {
        const candidateName = attempt === 1 ? baseName : `${baseName}-${attempt}`;
        const resolved = pathResolver.resolveIndependentProjectDirectory(candidateName);
        if (resolved.status === "invalid-name") {
            return {status: "invalid-name", message: resolved.message};
        }
        if (resolved.status !== "valid") {
            return {status: "unavailable", message: resolved.message};
        }

        const targetPath = path.join(resolved.directory, "blueprint.json");
        if (!fs.existsSync(targetPath)) {
            return {status: "valid", directory: resolved.directory, targetPath, name: candidateName};
        }
    }
    return {
        status: "unavailable",
        message: `Could not find an available managed project location for "${baseName}" after ${MAX_MANAGED_DESTINATION_ATTEMPTS} attempts.`,
    };
}

// A Blueprint is the source of truth for a managed Blueprint Project.  Do not leave a partly-written
// JSON document behind if Studio is interrupted while saving it: write a sibling temporary file and
// rename it into place, which is atomic on the one filesystem that contains both paths.
function writeBlueprintAtomically(targetPath: string, blueprint: unknown): void {
    const temporaryPath = path.join(
        path.dirname(targetPath),
        `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`,
    );
    try {
        fs.writeFileSync(temporaryPath, serializeGameBlueprint(blueprint), {flag: "wx"});
        fs.renameSync(temporaryPath, targetPath);
    } catch (error) {
        try {
            fs.unlinkSync(temporaryPath);
        } catch {
            // The temporary file either was never created or was already renamed.  The original error
            // remains the useful one for the caller.
        }
        throw error;
    }
}

function writeJsonAtomically(targetPath: string, value: unknown): void {
    const temporaryPath = path.join(
        path.dirname(targetPath),
        `.${path.basename(targetPath)}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2)}.tmp`,
    );
    try {
        fs.writeFileSync(temporaryPath, `${JSON.stringify(value, null, 4)}\n`, {encoding: "utf8", flag: "wx"});
        fs.renameSync(temporaryPath, targetPath);
    } catch (error) {
        try {
            fs.unlinkSync(temporaryPath);
        } catch {
            // Keep the publication failure as the useful error.
        }
        throw error;
    }
}

// Drives GameBlueprintValidating/GamePackageGenerating/loadGameBlueprint/buildGameBuildInfo/
// ParSheetImporting/ParSheetExporting — the exact same services `pokie build`/`pokie par import`/
// `pokie par export` themselves use — directly, for the Blueprint Editor's /api/home/blueprints/*
// endpoints. No CLI command is ever spawned as a subprocess, and none of their logic is reimplemented;
// this only adds the plain-data DTO conversions (never a stack trace) and the path-containment/
// overwrite-confirmation rules a GUI editor needs on top. Mirrors StudioHomeService's own "pokieVersion
// first, everything else an overridable collaborator" constructor shape; takes the already-built
// StudioHomeService as a collaborator purely so a successful build can be remembered via its own
// rememberRecentProject() — see that method's own doc comment for why that's public.
export class StudioBlueprintService {
    private readonly pokieVersion: string;
    private readonly studioRoot: string;
    private readonly homeService: StudioHomeService;
    private readonly loadBlueprint: (filePath: string) => unknown;
    private readonly blueprintValidator: GameBlueprintValidating;
    private readonly gamePackageGenerator: GamePackageGenerating;
    private readonly resolveReelStripGeneration: typeof resolveReelStripGeneration;
    private readonly parSheetImporter: ParSheetImporting;
    private readonly parSheetExporter: ParSheetExporting;
    private readonly randomBlueprintGenerator: RandomGameBlueprintGenerating;
    private readonly variantRandomBlueprintGenerator: RandomGameBlueprintGenerating;
    private readonly pathResolver: PokiePathResolver;
    private readonly stagedArtwork = new Map<string, string>();
    private readonly planner = new ArtifactConversionPlanner();

    constructor(
        pokieVersion: string,
        studioRoot: string,
        homeService: StudioHomeService,
        loadBlueprint: (filePath: string) => unknown = loadGameBlueprint,
        blueprintValidator: GameBlueprintValidating = new GameBlueprintValidator(),
        gamePackageGenerator: GamePackageGenerating = new GamePackageGenerator(pokieVersion),
        // Overridable purely so previewReelStripGeneration's per-reel isolation (see its own doc
        // comment) can be exercised against an injected failure in tests, without needing to construct
        // a genuinely crash-inducing malformed config against the real (already very defensive)
        // ReelStripGenerator -- the real resolveReelStripGeneration is always what "pokie build" itself
        // (and this service, by default) actually runs.
        resolveReelStripGenerationFn: typeof resolveReelStripGeneration = resolveReelStripGeneration,
        // Same "pokie par import/export" services the ParCommand CLI verb itself uses -- see
        // importParSheet()/exportParSheet()'s own doc comments for what this service adds on top.
        parSheetImporter: ParSheetImporting = new ParSheetImporter(),
        parSheetExporter: ParSheetExporting = new ParSheetExporter(pokieVersion),
        // Same two RandomGameBlueprintGenerator instances CreateCommand/BuildCommand's own "random"
        // preset selector wires up -- see random()'s own doc comment for why the Blueprint Editor's
        // "Generate random" reuses these rather than constructing its own strategy.
        randomBlueprintGenerator: RandomGameBlueprintGenerating = new RandomGameBlueprintGenerator(),
        variantRandomBlueprintGenerator: RandomGameBlueprintGenerating = new RandomGameBlueprintGenerator(
            new SlotGameNameGenerator(),
            new RandomGameBlueprintVariantStrategy(),
        ),
        // Same PokiePathResolver "POKIE Projects" convention pokie create/StudioHomeService.
        // resolveDefaultProjectDirectory already use for a brand-new managed project's own default
        // destination -- see saveManaged()'s own doc comment for why the guided editor's "first Save"
        // reuses it rather than growing its own placement policy.
        pathResolver: PokiePathResolver = new PokiePathResolver(),
    ) {
        this.pokieVersion = pokieVersion;
        this.studioRoot = path.resolve(studioRoot);
        this.homeService = homeService;
        this.loadBlueprint = loadBlueprint;
        this.blueprintValidator = blueprintValidator;
        this.gamePackageGenerator = gamePackageGenerator;
        this.resolveReelStripGeneration = resolveReelStripGenerationFn;
        this.parSheetImporter = parSheetImporter;
        this.parSheetExporter = parSheetExporter;
        this.randomBlueprintGenerator = randomBlueprintGenerator;
        this.variantRandomBlueprintGenerator = variantRandomBlueprintGenerator;
        this.pathResolver = pathResolver;
    }

    // Drives the Blueprint Editor's "Generate random" New-flow option via the exact same
    // RandomGameBlueprintGenerator "pokie build random"/"pokie create --random" already use (see this
    // class's own doc comment for "no business logic is duplicated") — never writes anything, purely
    // in-memory generation. "seed", when given, always reproduces the same blueprint for the same
    // preset/name (RandomGameBlueprintGenerator's own determinism contract); omitted, a fresh seed is
    // minted and echoed back in the result so "Randomize again" (a follow-up call with no seed) and an
    // exact-reproduction replay (a follow-up call with the returned seed) both work off the same DTO.
    public random(seed?: number, preset?: "default" | "variant", name?: string): StudioBlueprintRandomView {
        const resolvedPreset = preset ?? "default";
        const generator = resolvedPreset === "variant" ? this.variantRandomBlueprintGenerator : this.randomBlueprintGenerator;
        const {blueprint, seed: usedSeed, provenance} = generator.generate({seed, overrides: name ? {name} : undefined});
        return {status: "ok", blueprint, seed: usedSeed, preset: resolvedPreset, provenance};
    }

    public validate(blueprint: unknown): StudioBlueprintValidationView {
        const issues = this.blueprintValidator.validate(blueprint);
        const errors = issues.filter((issue) => issue.severity === "error");
        const warnings = issues.filter((issue) => issue.severity !== "error");
        // A generated reel's shape can be valid while its counts, fixed positions, and constraints
        // cannot produce a strip together. The materialization boundary resolves those exact specs,
        // so make that feasibility part of Studio's save-time validation too: a guided Save must not
        // persist a model which only fails when its Project is reopened.
        if (errors.length === 0 && isPlainObject(blueprint) && blueprint.reelStripGeneration !== undefined) {
            try {
                const resolution = this.resolveReelStripGeneration(blueprint as GameBlueprint);
                if (!resolution.success) {
                    resolution.reels
                        .filter((reel) => !reel.success)
                        .forEach((reel) => {
                            const diagnostic = reel.diagnostics[reel.diagnostics.length - 1]?.violations[0]?.message;
                            errors.push({
                                code: "blueprint-reelstripgeneration-unsatisfiable",
                                severity: "error",
                                message: `"reelStripGeneration[${reel.reelIndex}]" cannot satisfy its current configuration${diagnostic === undefined ? "." : `: ${diagnostic}`}`,
                            });
                        });
                }
            } catch (error) {
                errors.push({
                    code: "blueprint-reelstripgeneration-unresolvable",
                    severity: "error",
                    message: `"reelStripGeneration" could not be resolved: ${error instanceof Error ? error.message : String(error)}`,
                });
            }
        }
        return errors.length > 0 ? {status: "invalid", errors, warnings} : {status: "ok", warnings};
    }

    public load(rawPath: string): StudioBlueprintLoadView {
        const resolved = path.resolve(process.cwd(), rawPath);
        if (isPathWithin(this.studioRoot, resolved)) {
            return {status: "load-error", error: outsideStudioRootMessage(rawPath)};
        }

        try {
            const blueprint = this.loadBlueprint(resolved);
            return {status: "ok", path: resolved, blueprint, blueprintHash: computeGameBlueprintHash(blueprint)};
        } catch (error) {
            return {status: "load-error", error: error instanceof Error ? error.message : String(error)};
        }
    }

    // The Studio boundary an already-open editor polls (see BlueprintEditorPage's own background
    // source-check) to cheaply detect a persisted Blueprint source changing *externally* — a hand edit,
    // another Studio tab, a CLI command, anything that isn't this same caller's own Load/Save round trip
    // — without that caller needing to keep re-fetching and diffing the full content itself. Reuses
    // load() as-is rather than a lighter-weight stat-only check: computeGameBlueprintHash is a pure,
    // cheap function of already-parsed JSON, so there is no meaningfully faster path than "read + parse
    // + hash" here, and reusing load() means every one of its safety checks (studioRoot containment,
    // missing file, malformed JSON) is inherited for free instead of re-implemented.
    public checkSource(rawPath: string, knownHash: string): StudioBlueprintCheckView {
        const loaded = this.load(rawPath);
        if (loaded.status === "load-error") {
            return loaded;
        }
        if (loaded.blueprintHash === knownHash) {
            return {status: "unchanged"};
        }
        return {status: "changed", blueprint: loaded.blueprint, blueprintHash: loaded.blueprintHash};
    }

    // A save from a loaded source carries that source's `expectedHash`. Before writing, compare it with
    // the current on-disk Blueprint: another tab or an external edit must never be overwritten merely
    // because this caller previously owned the path. The conflict deliberately includes both states so
    // the UI can reload, compare, or save the edit elsewhere. The legacy overwrite gate remains for a
    // fresh Save target that has no loaded-source snapshot.
    public save(rawPath: string, blueprint: unknown, overwrite: boolean, expectedHash?: string): StudioBlueprintSaveView {
        const resolved = path.resolve(process.cwd(), rawPath);
        if (isPathWithin(this.studioRoot, resolved)) {
            return {status: "error", error: outsideStudioRootMessage(rawPath)};
        }

        const editedHash = computeGameBlueprintHash(blueprint);
        if (fs.existsSync(resolved)) {
            let currentBlueprint: unknown;
            let currentHash: string | undefined;
            try {
                currentBlueprint = this.loadBlueprint(resolved);
                currentHash = computeGameBlueprintHash(currentBlueprint);
            } catch {
                if (expectedHash !== undefined) {
                    return {
                        status: "conflict",
                        reason: "stale",
                        path: resolved,
                        error: `"${resolved}" changed or can no longer be read since it was loaded. Reload it before saving.`,
                        editedBlueprint: blueprint,
                        editedHash,
                        expectedHash,
                        canSaveAs: true,
                    };
                }
                if (!overwrite) {
                    return {
                        status: "conflict",
                        reason: "existing",
                        path: resolved,
                        error: `"${resolved}" already exists. Resubmit with "overwrite": true to replace it.`,
                        editedBlueprint: blueprint,
                        editedHash,
                        canSaveAs: true,
                    };
                }
            }

            if (expectedHash !== undefined && currentHash !== expectedHash) {
                return {
                    status: "conflict",
                    reason: "stale",
                    path: resolved,
                    error: `"${resolved}" changed since it was loaded. Reload, compare, or save your edits to a new path.`,
                    currentBlueprint,
                    currentHash,
                    editedBlueprint: blueprint,
                    editedHash,
                    expectedHash,
                    canSaveAs: true,
                };
            }
            if (expectedHash === undefined && !overwrite) {
                return {
                    status: "conflict",
                    reason: "existing",
                    path: resolved,
                    error: `"${resolved}" already exists. Resubmit with "overwrite": true to replace it.`,
                    currentBlueprint,
                    currentHash,
                    editedBlueprint: blueprint,
                    editedHash,
                    canSaveAs: true,
                };
            }
        } else if (expectedHash !== undefined) {
            return {
                status: "conflict",
                reason: "stale",
                path: resolved,
                error: `"${resolved}" no longer exists at the version that was loaded. Reload or save your edits to a new path.`,
                editedBlueprint: blueprint,
                editedHash,
                expectedHash,
                canSaveAs: true,
            };
        }

        try {
            fs.mkdirSync(path.dirname(resolved), {recursive: true});
            this.materializeSymbolArtwork(resolved, blueprint);
            writeBlueprintAtomically(resolved, blueprint);
            return {status: "ok", path: resolved, blueprintHash: editedHash};
        } catch (error) {
            return {status: "error", error: error instanceof Error ? error.message : String(error)};
        }
    }

    // The guided Design Game editor's own "first Save" -- unlike save() above, the caller never picks a
    // path: this resolves one itself (the same platform "POKIE Projects/<name>" convention pokie create
    // and StudioHomeService.resolveDefaultProjectDirectory already use, via PokiePathResolver), creates
    // the directory if needed, and writes `blueprint.json` inside it. `<name>` starts from the blueprint's
    // own manifest.id when it's a non-empty string, falling back to "blueprint" otherwise -- never
    // caller-supplied, since the whole point is the editor never has to ask. Never overwrites an existing
    // managed blueprint.json it did not itself just create in this call -- see
    // resolveAvailableManagedDestination's own doc comment for why this walks to the next "-2", "-3", ...
    // candidate instead, deterministically, rather than reporting save() above's 409/"conflict" (which
    // would force the guided flow to ask the user something it promises never to ask). The caller
    // (StudioServer's own route handler) is expected to register the returned path in StudioProjectRegistry
    // on "ok" -- this method only ever writes the file, the same "one concern per service" split
    // StudioBlueprintService.build()/homeService.rememberRecentProject() already follow. Only ever called
    // for a session's first Save -- every Save after that reuses the exact path this returned via the
    // ordinary save() above, so a later collision-avoidance re-walk here never happens for the same
    // session (see BlueprintEditorPage.tsx's own handleGuidedSave).
    //
    // `sourceWorkbookPath`, when given, is the .xlsx workbook this blueprint was Applied from (see
    // ParSheetImportExportPanel/handleApplyImportedBlueprint's own doc comments) -- the guided editor's
    // own "first Save" right after a PAR sheet Apply, the moment a freshly imported workbook actually
    // becomes a real managed Blueprint Project. Never written into the blueprint file itself (the managed
    // Blueprint stays the one, unpolluted editable source -- see this method's own doc comment above for
    // why saveManaged never asks the caller for anything blueprint-shape-related beyond the blueprint
    // itself) -- only echoed back on "ok" so the caller can record it as this project's own provenance
    // (see StudioServer's own handleBlueprintSaveManaged, which forwards it to
    // StudioProjectRegistrationService.registerManaged). Omitted entirely for an ordinary "first Save" with
    // no PAR import behind it.
    public saveManaged(blueprint: unknown, sourceWorkbookPath?: string, conversionEvidence?: StudioParSheetConversionEvidence): StudioBlueprintSaveManagedView {
        const baseName = deriveManagedBlueprintName(blueprint);
        const destination = resolveAvailableManagedDestination(this.pathResolver, baseName);
        if (destination.status === "invalid-name") {
            return {status: "invalid-name", error: destination.message};
        }
        if (destination.status !== "valid") {
            return {status: "unavailable", error: destination.message};
        }

        try {
            fs.mkdirSync(destination.directory, {recursive: true});
            this.materializeSymbolArtwork(destination.targetPath, blueprint);
            writeBlueprintAtomically(destination.targetPath, blueprint);
            const conversionEvidencePath = `${destination.targetPath}.conversion-evidence.json`;
            if (sourceWorkbookPath !== undefined && conversionEvidence !== undefined) {
                try {
                    writeJsonAtomically(conversionEvidencePath, {
                        schemaVersion: 1,
                        sourceWorkbook: path.resolve(sourceWorkbookPath),
                        provenance: undefined,
                        metaSheet: conversionEvidence.metaSheet,
                        facts: conversionEvidence.facts,
                        losslessEligible: conversionEvidence.losslessEligible,
                        importedBlueprintHash: conversionEvidence.importedBlueprintHash,
                        provenanceHashMatches: conversionEvidence.provenanceHashMatches,
                    });
                } catch (error) {
                    // This pair is one user-visible publication.  The managed
                    // destination was allocated by this call, so removing it
                    // cannot affect a pre-existing project.
                    fs.rmSync(destination.targetPath, {force: true});
                    fs.rmSync(conversionEvidencePath, {force: true});
                    throw error;
                }
            }
            return {
                status: "ok",
                path: destination.targetPath,
                name: destination.name,
                blueprintHash: computeGameBlueprintHash(blueprint),
                sourceWorkbookPath,
                ...(sourceWorkbookPath !== undefined && conversionEvidence !== undefined ? {conversionEvidencePath} : {}),
            };
        } catch (error) {
            return {status: "error", error: error instanceof Error ? error.message : String(error)};
        }
    }

    // Called only by StudioServer when registering the just-created managed project fails.  This is
    // deliberately narrower than a general delete API: the path came from this saveManaged() call, so
    // rolling it back cannot remove a user-selected or pre-existing Blueprint.
    public discardManagedSave(targetPath: string): void {
        try {
            fs.unlinkSync(targetPath);
            fs.rmSync(`${targetPath}.conversion-evidence.json`, {force: true});
            fs.rmdirSync(path.dirname(targetPath));
        } catch {
            // Rollback is best effort.  The route still reports registration failure rather than a
            // misleading success, and any empty directory is harmless.
        }
    }

    // Imports are deliberately staged outside the Blueprint: the document records only this stable,
    // project-relative reference.  The next save copies the staged PNG beside that document, so moving
    // the project keeps the artwork portable and no absolute picker path leaks into game data.
    public importSymbolArtwork(sourcePath: string): {status: "ok"; reference: string} | {status: "error"; error: string} {
        try {
            const source = path.resolve(sourcePath);
            const stat = fs.statSync(source);
            if (!stat.isFile()) {
                return {status: "error", error: "Selected artwork is not a file."};
            }
            if (stat.size > MAX_SYMBOL_ARTWORK_BYTES) {
                return {status: "error", error: `PNG artwork must be ${MAX_SYMBOL_ARTWORK_BYTES / (1024 * 1024)} MB or smaller.`};
            }
            const image = fs.readFileSync(source);
            if (path.extname(source).toLowerCase() !== ".png" || !image.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
                return {status: "error", error: "Selected artwork must be a valid PNG file."};
            }
            const safeName = path.basename(source, path.extname(source)).replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "") || "symbol";
            const reference = `${SYMBOL_ARTWORK_DIRECTORY}/${safeName}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.png`;
            const staged = path.join(os.tmpdir(), "pokie-studio-symbol-artwork", path.basename(reference));
            fs.mkdirSync(path.dirname(staged), {recursive: true});
            fs.copyFileSync(source, staged);
            this.stagedArtwork.set(reference, staged);
            return {status: "ok", reference};
        } catch (error) {
            return {status: "error", error: error instanceof Error ? error.message : String(error)};
        }
    }

    public resolveSymbolArtwork(blueprintPath: string, reference: string): string | undefined {
        if (!isSafeSymbolArtworkReference(reference)) {
            return undefined;
        }
        const resolved = path.resolve(path.dirname(blueprintPath), reference);
        if (!isPathWithin(path.dirname(blueprintPath), resolved)) {
            return undefined;
        }
        try {
            const stat = fs.statSync(resolved);
            return stat.isFile() && stat.size <= MAX_SYMBOL_ARTWORK_BYTES && fs.readFileSync(resolved).subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)
                ? resolved
                : undefined;
        } catch {
            return undefined;
        }
    }

    // The image route exposes references only from the active Blueprint document, never a generally
    // browsable project asset directory.  A missing/unreadable source is deliberately represented by
    // an empty map so every Studio surface can retain its symbol-id fallback.
    public getSymbolArtwork(blueprintPath: string): Record<string, string> {
        const loaded = this.load(blueprintPath);
        return loaded.status === "ok" ? symbolArtwork(loaded.blueprint) : {};
    }

    public materializeSymbolArtwork(blueprintPath: string, blueprint: unknown): void {
        for (const reference of symbolArtworkReferences(blueprint)) {
            if (!isSafeSymbolArtworkReference(reference)) {
                continue;
            }
            const staged = this.stagedArtwork.get(reference);
            if (staged === undefined || !fs.existsSync(staged)) {
                continue;
            }
            const destination = path.resolve(path.dirname(blueprintPath), reference);
            if (!isPathWithin(path.dirname(blueprintPath), destination)) {
                continue;
            }
            fs.mkdirSync(path.dirname(destination), {recursive: true});
            fs.copyFileSync(staged, destination);
            this.stagedArtwork.delete(reference);
        }
    }

    // Reads and maps a PAR sheet .xlsx workbook via ParSheetImporting (the exact same service "pokie par
    // import" itself uses) — every diagnostic here (unknown/missing sheets or columns, blank required
    // cells, provenance checks, the blueprint's own GameBlueprintValidator issues) comes straight from
    // ParSheetImportResult.issues, split by severity the same way validate() splits GameBlueprintValidator's
    // own issues; none of that mapping/validation logic is reimplemented here. Unlike load() (a JSON
    // blueprint file, parsed as-is), "ok" here never means the result is error-free — the PAR Sheet
    // Import/Export panel's own Diagnose & map step is what actually shows errors/warnings to the user,
    // exactly like previewReelStripGeneration()'s own "surfaced alongside, never instead of" contract.
    public async importParSheet(rawPath: string): Promise<StudioParSheetImportView> {
        const resolved = path.resolve(process.cwd(), rawPath);
        if (isPathWithin(this.studioRoot, resolved)) {
            return {status: "load-error", error: outsideStudioRootMessage(rawPath)};
        }

        try {
            const result = await this.parSheetImporter.importFromFile(resolved);
            const errors = result.issues.filter((issue) => issue.severity === "error");
            const warnings = result.issues.filter((issue) => issue.severity !== "error");
            return {
                status: "ok",
                path: resolved,
                blueprint: result.blueprint,
                provenance: result.provenance,
                conversionEvidence: result.conversionEvidence ?? {
                    metaSheet: undefined,
                    facts: result.issues.map((issue) => ({kind: "diagnostic" as const, code: issue.code, message: issue.message, ...(issue.details === undefined ? {} : {details: issue.details})})),
                    losslessEligible: false,
                    importedBlueprintHash: computeGameBlueprintHash(result.blueprint),
                    provenanceHashMatches: false,
                },
                errors,
                warnings,
            };
        } catch (error) {
            return {status: "load-error", error: error instanceof Error ? error.message : String(error)};
        }
    }

    // Writes a PAR sheet .xlsx workbook via ParSheetExporting (the exact same service "pokie par export"
    // itself uses). A conflict is reported, never a write: no request flag can replace an explicit output.
    // The prepared operation runs the shared registry destination check before exportToFile can allocate a
    // workbook. Every validation/export diagnostic in the "ok"/"invalid" result comes straight from
    // exportToFile's own returned issues (which already includes
    // running the exact same GameBlueprintValidator every other Studio DTO uses, plus PAR export's own
    // reel-source checks) — none of that is reimplemented or re-derived here.
    public async exportParSheet(blueprint: unknown, rawOutPath: string, _overwrite: boolean, sourcePath?: string): Promise<StudioParSheetExportView> {
        // The Studio request still accepts this legacy confirmation field, but
        // prepared artifact publication never overwrites an explicit output.
        // Keeping it in the request shape avoids a protocol break while
        // ensuring it cannot bypass the registry's destination policy.
        const resolved = path.resolve(process.cwd(), rawOutPath);
        if (isPathWithin(this.studioRoot, resolved)) {
            return {status: "error", error: outsideStudioRootMessage(rawOutPath)};
        }
        const source = this.blueprintSourceIdentity(blueprint, sourcePath);
        const plan = this.planner.planIdentity(source, "parWorkbook", {destinationPath: resolved});
        if (plan.status !== "planned") {
            return {status: "error", error: plan.diagnostic?.message ?? "PAR export is unavailable."};
        }
        const controller = new AbortController();
        let terminalFailure: unknown;
        try {
            const execution = await this.planner.executeConversionPlan(plan, {
                currentSource: () => this.blueprintSourceIdentity(blueprint, sourcePath),
                currentDestination: () => resolved,
                // Use the same source-alias and occupied-output boundary as
                // ArtifactBuilderRegistry.  It intentionally runs inside the
                // prepared operation, after source/destination rebinding and
                // before the writer can allocate a workbook.
                assertDestinationAvailable: () =>
                    assertPreparedArtifactDestinationAvailable(source.canonicalLocation, resolved, "file"),
                // The format writer validates its generated-reel details as
                // it publishes, but the stable Blueprint validation belongs
                // in the operation's read phase so destination policy is
                // always checked before a workbook writer is invoked.
                read: () => this.validate(blueprint),
                // ParSheetExporter owns additional generated-reel preflight
                // diagnostics that GameBlueprintValidator deliberately does
                // not duplicate.  It is atomic and returns those failures
                // without creating a workbook, so let that format boundary
                // run after planner destination checks even for a draft that
                // is already structurally invalid.
                canPublish: () => true,
                // PAR export performs its own atomic publication. The
                // operation owns its ordering and terminal boundary; the
                // shared policy has already ruled out a borrowed target.
                publish: () => this.parSheetExporter.exportToFile(blueprint, resolved, sourcePath, {signal: controller.signal}),
                cleanup: () => undefined,
                signal: controller.signal,
                onTerminalFailure: (error) => {
                    terminalFailure = error;
                },
            });
            if (!execution.published) {
                const validation = execution.read;
                return validation.status === "invalid"
                    ? {status: "invalid", errors: validation.errors, warnings: validation.warnings}
                    : {status: "error", error: "The prepared PAR export did not produce a publication."};
            }
            const issues = execution.publication!;
            const errors = issues.filter((issue) => issue.severity === "error");
            if (errors.length > 0) {
                return {status: "invalid", errors, warnings: issues.filter((issue) => issue.severity !== "error")};
            }
            return {status: "ok", path: resolved, warnings: issues};
        } catch (error) {
            const message = terminalFailure ?? error;
            const rendered = message instanceof Error ? message.message : String(message);
            return message instanceof ArtifactBuildConflictError
                ? {status: "conflict", path: resolved, error: rendered}
                : {status: "error", error: rendered};
        }
    }

    // Never writes anything — same technique as StudioHomeService.previewBuild()/BuildCommand's own
    // --dry-run: validate, then compute the same blueprintHash/expected-files preview
    // buildGameBuildInfo() already produces, purely in memory.
    public previewBuild(blueprint: unknown, outDir?: string, sourcePath?: string): StudioBuildPreviewView {
        const validated = this.validate(blueprint);
        if (validated.status === "invalid") {
            return validated;
        }

        const b = blueprint as GameBlueprint;
        const buildInfo = buildGameBuildInfo(b, this.pokieVersion, sourcePath);
        return {
            status: "ok",
            warnings: validated.warnings,
            manifest: b.manifest,
            reels: b.reels,
            rows: b.rows,
            symbolsCount: b.symbols.length,
            blueprintHash: buildInfo.blueprintHash,
            expectedFiles: buildInfo.files ?? [],
            ...previewBuildDestination(b.manifest.id, process.cwd(), outDir),
        };
    }

    // Runs the same generation/analysis pipeline "pokie build" itself would (resolveReelStripGeneration
    // for every "generated" reel, ReelStripAnalyzer for the resulting symbol counts/distances of every
    // reel, literal or generated) purely in memory, for the Reel Strip Modeler's live preview -- never
    // writes anything, and never reimplements ReelStripGenerator's own constraint-satisfaction logic.
    //
    // Deliberately never blocks the whole preview on validate()'s errors -- a blueprint-level problem
    // unrelated to reelStripGeneration (a broken paytable, an invalid availableBets, ...) shouldn't hide
    // every other, perfectly resolvable reel's result; `errors`/`warnings` are surfaced *alongside*
    // `reels`, not instead of them. A reelStripGeneration entry that isn't even a well-formed object
    // (realistic for a hand-edited JSON blueprint) is simply left out of `reels` rather than crashing
    // the request.
    //
    // Every "generated" reel is resolved via its own, isolated resolveReelStripGeneration() call --
    // a single-entry reelStripGeneration array containing just that reel's own spec -- rather than one
    // shared call over the whole array. Generation is already fully independent per reel (own
    // seed/rng), so this produces identical results either way, but it also means a malformed or
    // pathological config in ONE generated reel (however badly it fails, even a thrown exception) can
    // never affect any OTHER reel's own result -- a shared call would otherwise let one reel's crash
    // wipe out every other generated reel's summary too. A "generated" reel that can't satisfy its own
    // constraints is reported inline (success: false, with ReelStripGenerator's own
    // diagnostics/violations) rather than failing the whole preview.
    public previewReelStripGeneration(blueprint: unknown): StudioReelStripGenerationView {
        const validated = this.validate(blueprint);
        const errors = validated.status === "invalid" ? validated.errors : [];
        const warnings = validated.warnings;

        if (!isPlainObject(blueprint)) {
            return {status: "ok", errors, warnings, reels: []};
        }

        const rawSpecs: unknown[] = Array.isArray(blueprint.reelStripGeneration) ? blueprint.reelStripGeneration : [];
        if (rawSpecs.length === 0) {
            return {status: "ok", errors, warnings, reels: []};
        }

        const reels: StudioReelStripGenerationReelView[] = [];
        rawSpecs.forEach((rawSpec, reelIndex) => {
            if (!isPlainObject(rawSpec)) {
                return;
            }

            if (rawSpec.type === "literal") {
                const strip = rawSpec.strip;
                if (!Array.isArray(strip) || strip.length === 0 || !strip.every((s): s is string => typeof s === "string")) {
                    return;
                }
                reels.push({reelIndex, type: "literal", strip, analysis: ReelStripAnalyzer.analyze(new ReelStrip(strip))});
                return;
            }

            let summary: ReelStripGenerationSummary | undefined;
            try {
                const resolution = this.resolveReelStripGeneration({...blueprint, reelStripGeneration: [rawSpec]} as GameBlueprint);
                summary = (resolution.success ? resolution.reelStripGeneration?.reels : resolution.reels)?.[0];
            } catch {
                summary = undefined;
            }

            if (summary === undefined || !summary.success || summary.strip === undefined) {
                reels.push({
                    reelIndex,
                    type: "generated",
                    seed: typeof rawSpec.seed === "number" ? rawSpec.seed : (summary?.seed ?? 0),
                    success: false,
                    attemptsUsed: summary?.attemptsUsed ?? 0,
                    diagnostics: summary?.diagnostics ?? [],
                });
                return;
            }

            reels.push({
                reelIndex,
                type: "generated",
                seed: summary.seed,
                success: true,
                attemptsUsed: summary.attemptsUsed,
                diagnostics: summary.diagnostics,
                strip: summary.strip,
                analysis: ReelStripAnalyzer.analyze(new ReelStrip(summary.strip)),
            });
        });

        return {status: "ok", errors, warnings, reels};
    }

    // The guided Design Game editor's own live "Game Model" preview -- runs the exact same
    // buildGameModelProjection() the opened-Blueprint-project branch of GET /api/project/gameModel calls
    // (see buildProjectGameModel.ts), directly against whatever blueprint value the editor currently
    // holds, so Design Game/saved Blueprint/the Project Workspace's own Game Model tab all ever compute a
    // game model exactly one way. Never writes anything, and — unlike validate()/previewBuild() — never
    // blocks on GameBlueprintValidator's own errors first: an in-progress draft is exactly when a live
    // preview is most useful, so this tolerates a structurally incomplete draft (a required field
    // temporarily missing mid-edit) by falling back to an explicit "unavailable" projection instead of
    // ever throwing back to the caller. `sharedWeightsSampleSeed` re-rolls a "symbolWeights"/"default"
    // blueprint's own dynamic inspection sample (see BuildGameModelReelsOptions) -- undefined keeps the
    // default, reproducible one.
    public previewGameModel(blueprint: unknown, sharedWeightsSampleSeed?: number): GameModelProjection {
        try {
            return buildGameModelProjection(blueprint as GameBlueprint, undefined, {sharedWeightsSampleSeed});
        } catch (error) {
            return buildGameModelProjection(undefined, {
                reason: `This draft can't be projected into a game model yet: ${error instanceof Error ? error.message : String(error)}`,
            });
        }
    }

    public async build(blueprint: unknown, outDir?: string, sourcePath?: string): Promise<StudioBuildResult> {
        const validated = this.validate(blueprint);
        if (validated.status === "invalid") {
            return validated;
        }

        if (outDir !== undefined) {
            const resolvedOutDir = path.resolve(process.cwd(), outDir);
            if (isPathWithin(this.studioRoot, resolvedOutDir)) {
                return {status: "error", error: outsideStudioRootMessage(outDir)};
            }
        }

        const destination = path.resolve(process.cwd(), outDir ?? (blueprint as GameBlueprint).manifest.id);
        const source = this.blueprintSourceIdentity(blueprint, sourcePath);
        const plan = this.planner.planIdentity(source, "tsPackage", {destinationPath: destination});
        if (plan.status !== "planned") {
            return {status: "error", error: plan.diagnostic?.message ?? "Package build is unavailable."};
        }
        const controller = new AbortController();
        let terminalFailure: unknown;
        try {
            const execution = await this.planner.executeConversionPlan(plan, {
                currentSource: () => this.blueprintSourceIdentity(blueprint, sourcePath),
                currentDestination: () => destination,
                // Do not let an empty source alias or an occupied output
                // reach GamePackageGenerator.  This is the registry's exact
                // prepared publication policy, including realpath-based
                // source/self/descendant checks for symlink aliases.
                assertDestinationAvailable: () =>
                    assertPreparedArtifactDestinationAvailable(source.canonicalLocation, destination, "directory"),
                // validate() above has established the immutable draft's
                // structural read result.  Keep the actual generator in the
                // publication phase so the prepared operation applies its
                // destination and cancellation checks before it can allocate
                // the package directory.
                read: () => blueprint as GameBlueprint,
                canPublish: () => true,
                publish: () => this.gamePackageGenerator.generate(blueprint as GameBlueprint, process.cwd(), outDir, undefined, {signal: controller.signal}),
                register: (generated) => this.homeService.rememberRecentProject(generated.projectRoot, generated.manifest.name),
                // GamePackageGenerator owns a newly-created destination only
                // after it has returned successfully.  If registration or a
                // cancellation fails, release that publication and never a
                // borrowed existing directory (which destination policy has
                // already rejected).
                rollback: (generated) => fs.promises.rm(generated.projectRoot, {recursive: true, force: true}),
                cleanup: () => undefined,
                signal: controller.signal,
                onTerminalFailure: (error) => {
                    terminalFailure = error;
                },
            });
            if (!execution.published) return {status: "error", error: "The prepared package build did not produce a publication."};
            const generated = execution.publication!;
            return {
                status: "ok",
                projectRoot: generated.projectRoot,
                manifest: generated.manifest,
                createdFiles: generated.createdFiles,
                buildInfo: buildGameBuildInfo(blueprint as GameBlueprint, this.pokieVersion, sourcePath, undefined, generated.createdFiles),
                warnings: validated.warnings,
            };
        } catch (error) {
            const message = terminalFailure ?? error;
            return {status: "error", error: message instanceof Error ? message.message : String(message)};
        }
    }

    private blueprintSourceIdentity(blueprint: unknown, sourcePath?: string) {
        return {
            kind: "blueprint" as const,
            ...(sourcePath === undefined ? {} : {canonicalLocation: path.resolve(process.cwd(), sourcePath)}),
            recognitionProvenance: "Studio Blueprint editor draft",
            capabilities: [BLUEPRINT_BUILD_CAPABILITY],
            configurationProvenance: {configurationHash: computeGameBlueprintHash(blueprint)},
        };
    }
}
