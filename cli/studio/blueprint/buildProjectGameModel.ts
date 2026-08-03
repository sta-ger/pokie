import {buildGameModelProjection, GameBlueprint, GameModelProjection, GamePackageInspectionReport} from "pokie";
import type {StudioBlueprintLoadView} from "./StudioBlueprintLoadView.js";

// The one place GET /api/project/gameModel's own inputs -- the current project's inspect report, plus
// (when a tracked source is actually known) that source's own loaded content -- are turned into the
// canonical GameModelProjection buildGameModelProjection() itself computes. Every "why isn't this
// available" branch below produces its own plain-language `reason`, carried into every unavailable
// section by buildGameModelProjection -- a caller (GameModelView.tsx) never has to guess why a section is
// missing. `loadBlueprint` is injected (StudioServer passes its own StudioBlueprintService.load, bound)
// purely so this stays unit-testable without a real filesystem.
export function buildProjectGameModel(report: GamePackageInspectionReport, loadBlueprint: (path: string) => StudioBlueprintLoadView): GameModelProjection {
    const manifest = report.buildInfo?.game;

    if (!report.generated) {
        return buildGameModelProjection(undefined, {
            manifest,
            reason: "This project wasn't generated from a tracked source blueprint, so its game model can't be shown here.",
        });
    }

    const sourcePath = report.buildInfo?.source;
    if (sourcePath === undefined) {
        return buildGameModelProjection(undefined, {
            manifest,
            reason: "This project's build record has no tracked source blueprint path on record, so this section can't be shown here.",
        });
    }

    const loaded = loadBlueprint(sourcePath);
    if (loaded.status === "load-error") {
        return buildGameModelProjection(undefined, {
            manifest,
            reason: `The project's tracked source blueprint could not be loaded: ${loaded.error}`,
        });
    }

    return buildGameModelProjection(loaded.blueprint as GameBlueprint);
}
