import {buildGameModelProjection, describeUnavailableWasmComponent, describeWasmGameModelBoundary, GameBlueprint, GameModelProjection, GamePackageInspectionReport, PokieProject, readWasmComponentManifest} from "pokie";
import path from "path";
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
            reason: describeWasmGameModelBoundary(),
        });
    }

    // A component can become incompatible after Studio has already opened its
    // path (for example when its sidecar is edited).  Never fall through to a
    // package reader merely because re-resolution now rejects that WASM path.
    if (path.extname(projectRoot).toLowerCase() === ".wasm") {
        return buildGameModelProjection(undefined, {reason: describeUnavailableWasmComponent()});
    }

    const inspected = readers.inspectPackage(projectRoot);
    if (!inspected.valid || inspected.packageJson === undefined) {
        return buildGameModelProjection(undefined, {reason: inspected.error ?? "This project's package could not be inspected."});
    }
    // package.json's own "name" is an npm package identifier, never the game's own id or display name --
    // and unlike version (which GamePackageMerger always keeps in lockstep with the manifest's own
    // `version`, see its own `firstNonBlank(versionOverride, existingPkg.version, DEFAULT_VERSION)`),
    // there is no such guarantee for `name` in either direction Studio would need to trust it as identity:
    // GamePackageGenerator (`pokie build --target tsPackage`) writes it as `blueprint.manifest.id`
    // verbatim, but GamePackageMerger (`pokie init`) writes it from `--package-name`/the directory name,
    // a value `pokie init --package-name <x> --game-id <y>` lets a caller set to something else entirely
    // from `--game-id` (see docs/cli.md's own "`--game-id` never seeds or otherwise changes package.json's
    // `name`" -- the same is true of `--game-name`). GamePackageInspector's report carries no provenance
    // marker distinguishing a built package (where the two really do agree) from an init'd one (where they
    // may not), so there is no case in which reading `basics.id`/`basics.name` off `packageJson.name` here
    // is safe -- it is left unset in both, not guessed at from a value that might be right by coincidence.
    // The game's own display name is never recoverable from a compiled package at all.
    return buildGameModelProjection(undefined, {
        manifest: {version: inspected.packageJson.version, description: inspected.packageJson.description},
        reason:
            `This project is a compiled TypeScript package${inspected.packageJson.name !== undefined ? ` ("${inspected.packageJson.name}")` : ""} -- ` +
            "Studio can only read its package.json here, and package.json's own \"name\" is an npm package identifier that " +
            "isn't necessarily this game's own id or name -- open its own Blueprint source to see the full game model.",
    });
}
