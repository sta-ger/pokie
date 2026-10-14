import {PackageBlueprintExtraction, buildPackageGameModelProjection, buildGameModelProjection, describeUnavailableWasmComponent, describeWasmGameModelBoundary, GameBlueprint, GameModelProjection, GamePackageInspectionReport, isWasmComponentFile, ParSheetImportResult, PokieProject, readWasmComponentManifest} from "@fromstan/pokie";
import type {StudioBlueprintLoadView} from "./StudioBlueprintLoadView.js";

// The collaborators GET /api/project/gameModel's own resolved-project-type dispatch needs to actually
// read each source -- injected (rather than this module reaching for StudioServer's own services
// directly) purely so buildProjectGameModel stays unit-testable without a real filesystem, same
// convention the old (deleted) buildProjectGameModel.ts used for `loadBlueprint`.
export type GameModelSourceReaders = {
    extractPackage?: (projectRoot: string) => ReturnType<PackageBlueprintExtraction["extract"]>;
    loadBlueprint: (projectRoot: string) => StudioBlueprintLoadView;
    inspectPackage: (projectRoot: string) => GamePackageInspectionReport;
    importParWorkbook: (projectRoot: string) => Promise<ParSheetImportResult>;
    readWasmManifest: typeof readWasmComponentManifest;
};

// GET /api/project/gameModel routes requested model reads to the authoritative format reader.
// Package model extraction is executable and capability-based; ordinary package metadata inspection
// remains separate. An unresolved source only has metadata. Every unavailable section carries a
// concrete reason, while package projections retain field evidence and comparison boundaries.
export async function buildProjectGameModel(
    projectRoot: string,
    resolved: PokieProject | undefined,
    isOpenedBlueprintProject: boolean,
    readers: GameModelSourceReaders,
    // Only meaningful for a "symbolWeights"/"default" blueprint's own dynamic inspection sample -- see
    // buildGameModelReels' own BuildGameModelReelsOptions doc comment. Threaded through from GET
    // /api/project/gameModel's own "sharedWeightsSampleSeed" query param so the Game Model Reels view's
    // own "New sample" action can re-roll a fresh, still-reproducible sample for a saved Blueprint
    // Project without writing anything to disk.
    sharedWeightsSampleSeed?: number,
    // A WASM component can be resolved when Studio opens it and become malformed
    // or incompatible before this later read.  The resolver owns the actionable
    // contract diagnostic, so carry it into the projection instead of replacing
    // it with the generic unavailable wording below.
    unresolvedWasmReason?: string,
): Promise<GameModelProjection> {
    if (isOpenedBlueprintProject) {
        const loaded = readers.loadBlueprint(projectRoot);
        if (loaded.status === "load-error") {
            return buildGameModelProjection(undefined, {reason: `This project's Blueprint source could not be loaded: ${loaded.error}`});
        }
        return buildGameModelProjection(loaded.blueprint as GameBlueprint, undefined, {sharedWeightsSampleSeed});
    }

    if (resolved !== undefined && (resolved.type === "outcomeLibrary" || resolved.type === "stakeAdapter")) {
        return buildGameModelProjection(undefined, {
            reason: "This project is a pre-generated outcome source, not a Blueprint -- Studio never derives a game model from outcome data.",
        });
    }

    // PAR is an exchange file, not a package directory.  Its only canonical game-model read is
    // the same importer used by `pokie par import`; projecting that immutable reconstructed
    // blueprint keeps Game Model useful without pretending the workbook contains package.json.
    if (resolved?.type === "parWorkbook") {
        try {
            const imported = await readers.importParWorkbook(resolved.rootPath);
            const errors = imported.issues.filter((issue) => issue.severity === "error");
            if (errors.length > 0) {
                return buildGameModelProjection(undefined, {reason: `This PAR workbook could not be projected: ${errors.map((issue) => issue.message).join("; ")}`});
            }
            return buildGameModelProjection(imported.blueprint, undefined, {sharedWeightsSampleSeed});
        } catch (error) {
            return buildGameModelProjection(undefined, {reason: `This PAR workbook could not be read: ${error instanceof Error ? error.message : String(error)}`});
        }
    }

    if (resolved !== undefined && resolved.type === "wasm") {
        const manifestRead = await readers.readWasmManifest(resolved);
        if (!manifestRead.supported) {
            return buildGameModelProjection(undefined, {reason: manifestRead.diagnostic.message});
        }
        if (manifestRead.canonical !== undefined) {
            const model = manifestRead.canonical.model;
            return buildGameModelProjection({
                manifest: {id: manifestRead.manifest.component.id, name: manifestRead.manifest.component.id, version: manifestRead.manifest.component.version},
                reels: model.reels,
                rows: model.rows,
                symbols: [...new Set(model.reelStrips.flat())],
                reelStrips: model.reelStrips.map((strip) => [...strip]),
                paylines: model.paylines.map((line) => [...line]),
                paytable: model.paytable,
                ...(model.wilds === undefined ? {} : {wilds: [...model.wilds]}),
                ...(model.scatters === undefined ? {} : {scatters: [...model.scatters]}),
                ...(model.availableBets === undefined ? {} : {availableBets: [...model.availableBets]}),
            } as GameBlueprint);
        }
        return buildGameModelProjection(undefined, {
            manifest: {id: manifestRead.manifest.component.id, version: manifestRead.manifest.component.version},
            reason: describeWasmGameModelBoundary(),
        });
    }

    // A component can become incompatible after Studio has already opened its
    // path (for example when its sidecar is edited).  Never fall through to a
    // package reader merely because re-resolution now rejects that WASM path.
    if (isWasmComponentFile(projectRoot)) {
        return buildGameModelProjection(undefined, {reason: unresolvedWasmReason ?? describeUnavailableWasmComponent()});
    }

    if (!resolved && !readers.extractPackage) {
        const inspected = readers.inspectPackage(projectRoot);
        if (!inspected.valid || !inspected.packageJson) return buildGameModelProjection(undefined, {reason: inspected.error ?? "This project's package could not be inspected."});
        return buildGameModelProjection(undefined, {manifest: {version: inspected.packageJson.version, description: inspected.packageJson.description}, reason: `This unresolved compiled TypeScript package${inspected.packageJson.name ? ` ("${inspected.packageJson.name}")` : ""} has metadata only; resolve a runnable package to request public model extraction.`});
    }
    const extracted = await (readers.extractPackage ?? ((root: string) => new PackageBlueprintExtraction().extract(root)))(projectRoot);
    return buildPackageGameModelProjection(extracted);
}
