import {
    buildGameBuildInfo,
    computeGameBlueprintHash,
    GameBlueprint,
    GameBlueprintValidating,
    GameBlueprintValidator,
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
    ValidationIssue,
} from "pokie";
import fs from "fs";
import path from "path";
import {PokiePathResolver} from "../../paths/PokiePathResolver.js";
import {applyGameBlueprintToProject} from "./applyGameBlueprintToProject.js";
import {isPathWithin} from "../isPathWithin.js";
import {previewBuildDestination} from "../previewBuildDestination.js";
import type {StudioHomeService} from "../home/StudioHomeService.js";
import type {StudioBuildPreviewView} from "../home/StudioBuildPreviewView.js";
import type {StudioBuildResult} from "../home/StudioBuildResult.js";
import {serializeGameBlueprint} from "./serializeGameBlueprint.js";
import type {StudioBlueprintApplyView} from "./StudioBlueprintApplyView.js";
import type {StudioBlueprintCheckView} from "./StudioBlueprintCheckView.js";
import type {StudioBlueprintLoadView} from "./StudioBlueprintLoadView.js";
import type {StudioBlueprintRandomView} from "./StudioBlueprintRandomView.js";
import type {StudioBlueprintSaveManagedView} from "./StudioBlueprintSaveManagedView.js";
import type {StudioBlueprintSaveView} from "./StudioBlueprintSaveView.js";
import type {StudioBlueprintValidationView} from "./StudioBlueprintValidationView.js";
import type {StudioParSheetExportView} from "./StudioParSheetExportView.js";
import type {StudioParSheetImportView} from "./StudioParSheetImportView.js";
import type {StudioReelStripGenerationReelView, StudioReelStripGenerationView} from "./StudioReelStripGenerationView.js";

const outsideStudioRootMessage = (rawPath: string): string =>
    `"${rawPath}" resolves inside POKIE Studio's own internal directory and cannot be used as a blueprint path.`;

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
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

    // Refuses to overwrite a file that already exists unless the request explicitly says `overwrite:
    // true` — reported as "conflict", never a silent overwrite. The editor is expected to show this to
    // the user and, once they confirm, resend the same request with `overwrite: true`.
    public save(rawPath: string, blueprint: unknown, overwrite: boolean): StudioBlueprintSaveView {
        const resolved = path.resolve(process.cwd(), rawPath);
        if (isPathWithin(this.studioRoot, resolved)) {
            return {status: "error", error: outsideStudioRootMessage(rawPath)};
        }

        if (fs.existsSync(resolved) && !overwrite) {
            return {
                status: "conflict",
                path: resolved,
                error: `"${resolved}" already exists. Resubmit with "overwrite": true to replace it.`,
            };
        }

        try {
            fs.mkdirSync(path.dirname(resolved), {recursive: true});
            fs.writeFileSync(resolved, serializeGameBlueprint(blueprint));
            return {status: "ok", path: resolved, blueprintHash: computeGameBlueprintHash(blueprint)};
        } catch (error) {
            return {status: "error", error: error instanceof Error ? error.message : String(error)};
        }
    }

    // The guided Design Game editor's own "first Save" -- unlike save() above, the caller never picks a
    // path: this resolves one itself (the same platform "POKIE Projects/<name>" convention pokie create
    // and StudioHomeService.resolveDefaultProjectDirectory already use, via PokiePathResolver), creates
    // the directory if needed, and always writes `blueprint.json` inside it. `<name>` comes from the
    // blueprint's own manifest.id when it's a non-empty string, falling back to "blueprint" otherwise --
    // never caller-supplied, since the whole point is the editor never has to ask. Always overwrites
    // (never a 409/"conflict" the way save() reports one): the destination is a location this service
    // itself just picked from the blueprint's own identity, not a user-chosen path that might already
    // hold someone else's unrelated file. The caller (StudioServer's own route handler) is expected to
    // register the returned path in StudioProjectRegistry on "ok" -- this method only ever writes the
    // file, the same "one concern per service" split StudioBlueprintService.build()/
    // homeService.rememberRecentProject() already follow.
    public saveManaged(blueprint: unknown): StudioBlueprintSaveManagedView {
        const name = deriveManagedBlueprintName(blueprint);
        const resolved = this.pathResolver.resolveIndependentProjectDirectory(name);
        if (resolved.status === "invalid-name") {
            return {status: "invalid-name", error: resolved.message};
        }
        if (resolved.status !== "valid") {
            return {status: "unavailable", error: resolved.message};
        }

        const targetPath = path.join(resolved.directory, "blueprint.json");
        try {
            fs.mkdirSync(resolved.directory, {recursive: true});
            fs.writeFileSync(targetPath, serializeGameBlueprint(blueprint));
            return {status: "ok", path: targetPath, name, blueprintHash: computeGameBlueprintHash(blueprint)};
        } catch (error) {
            return {status: "error", error: error instanceof Error ? error.message : String(error)};
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
            return {status: "ok", path: resolved, blueprint: result.blueprint, provenance: result.provenance, errors, warnings};
        } catch (error) {
            return {status: "load-error", error: error instanceof Error ? error.message : String(error)};
        }
    }

    // Writes a PAR sheet .xlsx workbook via ParSheetExporting (the exact same service "pokie par export"
    // itself uses) — same overwrite-confirmation contract as save() (a "conflict" is reported, never a
    // write, unless the request already set `overwrite: true`), checked *before* ParSheetExporting.
    // exportToFile is ever called, since that call's own validation is comparatively expensive and the
    // conflict check needs no I/O beyond an existsSync. Every validation/export diagnostic in the "ok"/
    // "invalid" result comes straight from exportToFile's own returned issues (which already includes
    // running the exact same GameBlueprintValidator every other Studio DTO uses, plus PAR export's own
    // reel-source checks) — none of that is reimplemented or re-derived here.
    public async exportParSheet(blueprint: unknown, rawOutPath: string, overwrite: boolean, sourcePath?: string): Promise<StudioParSheetExportView> {
        const resolved = path.resolve(process.cwd(), rawOutPath);
        if (isPathWithin(this.studioRoot, resolved)) {
            return {status: "error", error: outsideStudioRootMessage(rawOutPath)};
        }

        if (fs.existsSync(resolved) && !overwrite) {
            return {
                status: "conflict",
                path: resolved,
                error: `"${resolved}" already exists. Resubmit with "overwrite": true to replace it.`,
            };
        }

        let issues: ValidationIssue[];
        try {
            issues = await this.parSheetExporter.exportToFile(blueprint, resolved, sourcePath);
        } catch (error) {
            return {status: "error", error: error instanceof Error ? error.message : String(error)};
        }

        const errors = issues.filter((issue) => issue.severity === "error");
        if (errors.length > 0) {
            return {status: "invalid", errors, warnings: issues.filter((issue) => issue.severity !== "error")};
        }
        return {status: "ok", path: resolved, warnings: issues};
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

        let generated;
        try {
            generated = this.gamePackageGenerator.generate(blueprint as GameBlueprint, process.cwd(), outDir);
        } catch (error) {
            return {status: "error", error: error instanceof Error ? error.message : String(error)};
        }

        await this.homeService.rememberRecentProject(generated.projectRoot, generated.manifest.name);
        return {
            status: "ok",
            projectRoot: generated.projectRoot,
            manifest: generated.manifest,
            createdFiles: generated.createdFiles,
            // Computed purely for this API response -- never persisted into the built package itself
            // (see GamePackageGenerator's own doc comment).
            buildInfo: buildGameBuildInfo(blueprint as GameBlueprint, this.pokieVersion, sourcePath, undefined, generated.createdFiles),
            warnings: validated.warnings,
        };
    }

    // Commits an edited blueprint back to an already-open project's own source file and rebuilds its
    // generated package in place, as a single conditional-commit "transaction" — see
    // applyGameBlueprintToProject.ts for the hash-based conflict check and stage-then-atomically-
    // publish-both semantics this only adds the path-containment guard on top of. `projectRoot`/
    // `sourcePath` are expected to already be resolved by the caller (StudioServer, from the current
    // project's own build-info.json — see GamePackageInspector) rather than taken from client input,
    // but this still applies the same studioRoot containment guard save()/build() do, defensively.
    public applyToProject(projectRoot: string, sourcePath: string, expectedHash: string, blueprint: unknown): StudioBlueprintApplyView {
        if (isPathWithin(this.studioRoot, projectRoot)) {
            return {status: "error", error: outsideStudioRootMessage(projectRoot)};
        }
        if (isPathWithin(this.studioRoot, sourcePath)) {
            return {status: "error", error: outsideStudioRootMessage(sourcePath)};
        }

        return applyGameBlueprintToProject({
            projectRoot,
            sourcePath,
            expectedHash,
            blueprint,
            blueprintValidator: this.blueprintValidator,
            gamePackageGenerator: this.gamePackageGenerator,
        });
    }
}
