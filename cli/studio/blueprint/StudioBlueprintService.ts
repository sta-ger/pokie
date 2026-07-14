import {
    buildGameBuildInfo,
    GameBlueprint,
    GameBlueprintValidating,
    GameBlueprintValidator,
    GamePackageGenerating,
    GamePackageGenerator,
    loadGameBlueprint,
    ReelStrip,
    ReelStripAnalyzer,
    ReelStripGenerationSummary,
    resolveReelStripGeneration,
} from "pokie";
import fs from "fs";
import path from "path";
import {isPathWithin} from "../isPathWithin.js";
import type {StudioHomeService} from "../home/StudioHomeService.js";
import type {StudioBuildPreviewView} from "../home/StudioBuildPreviewView.js";
import type {StudioBuildResult} from "../home/StudioBuildResult.js";
import {serializeGameBlueprint} from "./serializeGameBlueprint.js";
import type {StudioBlueprintLoadView} from "./StudioBlueprintLoadView.js";
import type {StudioBlueprintSaveView} from "./StudioBlueprintSaveView.js";
import type {StudioBlueprintValidationView} from "./StudioBlueprintValidationView.js";
import type {StudioReelStripGenerationReelView, StudioReelStripGenerationView} from "./StudioReelStripGenerationView.js";

const outsideStudioRootMessage = (rawPath: string): string =>
    `"${rawPath}" resolves inside POKIE Studio's own internal directory and cannot be used as a blueprint path.`;

// Drives GameBlueprintValidating/GamePackageGenerating/loadGameBlueprint/buildGameBuildInfo — the exact
// same services `pokie build <config.json>` itself uses — directly, for the Blueprint Editor's five
// /api/home/blueprints/* endpoints. No CLI command is ever spawned as a subprocess, and none of their
// logic is reimplemented; this only adds the plain-data DTO conversions (never a stack trace) and the
// path-containment/overwrite-confirmation rules a GUI editor needs on top. Mirrors StudioHomeService's
// own "pokieVersion first, everything else an overridable collaborator" constructor shape; takes the
// already-built StudioHomeService as a collaborator purely so a successful build can be remembered via
// its own rememberRecentProject() — see that method's own doc comment for why that's public.
export class StudioBlueprintService {
    private readonly pokieVersion: string;
    private readonly studioRoot: string;
    private readonly homeService: StudioHomeService;
    private readonly loadBlueprint: (filePath: string) => unknown;
    private readonly blueprintValidator: GameBlueprintValidating;
    private readonly gamePackageGenerator: GamePackageGenerating;

    constructor(
        pokieVersion: string,
        studioRoot: string,
        homeService: StudioHomeService,
        loadBlueprint: (filePath: string) => unknown = loadGameBlueprint,
        blueprintValidator: GameBlueprintValidating = new GameBlueprintValidator(),
        gamePackageGenerator: GamePackageGenerating = new GamePackageGenerator(pokieVersion),
    ) {
        this.pokieVersion = pokieVersion;
        this.studioRoot = path.resolve(studioRoot);
        this.homeService = homeService;
        this.loadBlueprint = loadBlueprint;
        this.blueprintValidator = blueprintValidator;
        this.gamePackageGenerator = gamePackageGenerator;
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
            return {status: "ok", path: resolved, blueprint: this.loadBlueprint(resolved)};
        } catch (error) {
            return {status: "load-error", error: error instanceof Error ? error.message : String(error)};
        }
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
            return {status: "ok", path: resolved};
        } catch (error) {
            return {status: "error", error: error instanceof Error ? error.message : String(error)};
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
        };
    }

    // Runs the same generation/analysis pipeline "pokie build" itself would (resolveReelStripGeneration
    // for every "generated" reel, ReelStripAnalyzer for the resulting symbol counts/distances of every
    // reel, literal or generated) purely in memory, for the Reel Strip Modeler's live preview -- never
    // writes anything, and never reimplements ReelStripGenerator's own constraint-satisfaction logic. A
    // "generated" reel that can't satisfy its constraints is reported inline (success: false, with
    // ReelStripGenerator's own diagnostics/violations) rather than failing the whole preview, so every
    // other reel's result is still shown at once -- exactly the information a "pokie build" failure
    // would report, just before committing to a build.
    public previewReelStripGeneration(blueprint: unknown): StudioReelStripGenerationView {
        const validated = this.validate(blueprint);
        if (validated.status === "invalid") {
            return validated;
        }

        const b = blueprint as GameBlueprint;
        const specs = b.reelStripGeneration ?? [];
        if (specs.length === 0) {
            return {status: "ok", warnings: validated.warnings, reels: []};
        }

        const resolution = resolveReelStripGeneration(b);
        const summariesByReelIndex = new Map<number, ReelStripGenerationSummary>();
        for (const summary of (resolution.success ? resolution.reelStripGeneration?.reels : resolution.reels) ?? []) {
            summariesByReelIndex.set(summary.reelIndex, summary);
        }

        const reels: StudioReelStripGenerationReelView[] = specs.map((spec, reelIndex) => {
            if (spec.type === "literal") {
                return {
                    reelIndex,
                    type: "literal",
                    strip: spec.strip,
                    analysis: ReelStripAnalyzer.analyze(new ReelStrip(spec.strip)),
                };
            }

            const summary = summariesByReelIndex.get(reelIndex);
            if (summary === undefined || !summary.success || summary.strip === undefined) {
                return {
                    reelIndex,
                    type: "generated",
                    seed: spec.seed,
                    success: false,
                    attemptsUsed: summary?.attemptsUsed ?? 0,
                    diagnostics: summary?.diagnostics ?? [],
                };
            }

            return {
                reelIndex,
                type: "generated",
                seed: summary.seed,
                success: true,
                attemptsUsed: summary.attemptsUsed,
                diagnostics: summary.diagnostics,
                strip: summary.strip,
                analysis: ReelStripAnalyzer.analyze(new ReelStrip(summary.strip)),
            };
        });

        return {status: "ok", warnings: validated.warnings, reels};
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
            generated = this.gamePackageGenerator.generate(blueprint as GameBlueprint, process.cwd(), outDir, sourcePath);
        } catch (error) {
            return {status: "error", error: error instanceof Error ? error.message : String(error)};
        }

        await this.homeService.rememberRecentProject(generated.projectRoot, generated.manifest.name);
        return {
            status: "ok",
            projectRoot: generated.projectRoot,
            manifest: generated.manifest,
            createdFiles: generated.createdFiles,
            buildInfo: generated.buildInfo,
            unchanged: generated.unchanged,
            warnings: validated.warnings,
        };
    }
}
