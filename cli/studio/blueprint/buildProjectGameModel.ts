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

// The one place GET /api/project/gameModel's own inputs -- the current project's resolved PokieProject
// (see ProjectTargetResolver), plus whether it's an opened "blueprint" project (see StudioServer's own
// isOpenedBlueprintProject -- a plain-file `projectRoot` counts even when resolution itself came back
// empty) -- are turned into the canonical GameModelProjection buildGameModelProjection() itself computes.
// Mirrors the exact three-way dispatch StudioServer's handleInspectProject/handleValidateProject already
// established (see StudioServer.ts's own doc comment on resolveOpenedProject): "blueprint" reads the full
// tracked source via StudioBlueprintService; "outcomeLibrary"/"stakeAdapter" never derive a game model at
// all (a pre-generated outcome source is drawn from, not modeled -- see OutcomeSourceProjectReport's own
// doc comment); canonical "wasm" exposes its integrity-bound embedded model while legacy files expose their manifest identity (the portable runtime does not
// introspect anything beyond that -- see PokieWasmComponentManifest's own doc comment); everything else
// ("tsPackage", the default) exposes only package.json's own version/description as `basics` (its own
// "name" is an npm package identifier that isn't reliably this game's own id or name, see the tsPackage
// branch's own doc comment below, so it is never projected into either field), since GamePackageInspector
// reads nothing deeper. Every branch's `reason` is plain language a caller (GameModelTab.tsx) shows
// verbatim, never a guess the UI has to construct itself.
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
