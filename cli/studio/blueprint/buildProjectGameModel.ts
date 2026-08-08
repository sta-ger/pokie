import {buildGameModelProjection, GameBlueprint, GameModelProjection, GamePackageInspectionReport, PokieProject, readWasmComponentManifest} from "pokie";
import type {StudioBlueprintLoadView} from "./StudioBlueprintLoadView.js";

// The collaborators GET /api/project/gameModel's own resolved-project-type dispatch needs to actually
// read each source -- injected (rather than this module reaching for StudioServer's own services
// directly) purely so buildProjectGameModel stays unit-testable without a real filesystem, same
// convention the old (deleted) buildProjectGameModel.ts used for `loadBlueprint`.
export type GameModelSourceReaders = {
    loadBlueprint: (projectRoot: string) => StudioBlueprintLoadView;
    inspectPackage: (projectRoot: string) => GamePackageInspectionReport;
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
// doc comment); "wasm" exposes only its own manifest identity (POKIE has no WASM execution backend to
// introspect anything beyond that -- see PokieWasmComponentManifest's own doc comment); everything else
// ("tsPackage", the default) exposes only package.json's own name/version/description, since
// GamePackageInspector reads nothing deeper. Every branch's `reason` is plain language a caller
// (GameModelTab.tsx) shows verbatim, never a guess the UI has to construct itself.
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

    if (resolved !== undefined && resolved.type === "wasm") {
        const manifestRead = await readers.readWasmManifest(resolved);
        if (!manifestRead.supported) {
            return buildGameModelProjection(undefined, {reason: manifestRead.diagnostic.message});
        }
        return buildGameModelProjection(undefined, {
            manifest: {id: manifestRead.manifest.component.id, version: manifestRead.manifest.component.version},
            reason: "This project is a WASM component -- only its own manifest identity is exposed here; POKIE has no execution backend to introspect its underlying game model.",
        });
    }

    const inspected = readers.inspectPackage(projectRoot);
    if (!inspected.valid || inspected.packageJson === undefined) {
        return buildGameModelProjection(undefined, {reason: inspected.error ?? "This project's package could not be inspected."});
    }
    return buildGameModelProjection(undefined, {
        manifest: {name: inspected.packageJson.name, version: inspected.packageJson.version, description: inspected.packageJson.description},
        reason: "This project is a compiled TypeScript package -- Studio can only read its package.json here; open its own Blueprint source to see the full game model.",
    });
}
