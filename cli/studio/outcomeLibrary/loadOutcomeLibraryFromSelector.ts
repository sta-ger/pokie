import type {OutcomeLibraryBundleReading, StakeEngineImporting, ValidationIssue, WeightedOutcomeLibrary} from "pokie";
import {loadWeightedOutcomeLibraryFromProjectFile} from "../deployment/loadWeightedOutcomeLibraryFromProjectFile.js";
import {resolveProjectDirectory} from "./resolveProjectDirectory.js";
import type {OutcomeLibrarySelector} from "./OutcomeLibrarySelector.js";

export type LoadedOutcomeLibrary =
    | {
          readonly status: "ok";
          readonly library: WeightedOutcomeLibrary<string>;
          readonly source: "json" | "bundle" | "stakeengine";
          readonly envelope?: {readonly game: {id: string; name: string; version: string}; readonly configHash?: string; readonly pokieVersion: string};
          readonly importIssues: readonly ValidationIssue[];
      }
    | {readonly status: "load-error"; readonly error: string};

// The one place an OutcomeLibrarySelector is actually resolved down to a genuine WeightedOutcomeLibrary --
// shared by StudioDeploymentService (each deployment mode's own library) and StudioStakeEngineExportService
// (each export mode's own library), so a "json"/"bundle"/"stakeengine" source is only ever read one way,
// not several slowly-diverging copies of the same three branches. Never validates the result's own shape
// as a genuine WeightedOutcomeLibrary -- that's each caller's own job (see StudioDeploymentService's own
// reliance on ExternalDeploymentService's pipeline for that check).
export async function loadOutcomeLibraryFromSelector(
    projectRoot: string,
    selector: OutcomeLibrarySelector,
    bundleReader: OutcomeLibraryBundleReading<string>,
    stakeEngineImporter: StakeEngineImporting<string>,
    readFile: (resolvedPath: string) => string,
    realpath: (resolvedPath: string) => string,
): Promise<LoadedOutcomeLibrary> {
    if (selector.kind === "json") {
        const loaded = loadWeightedOutcomeLibraryFromProjectFile(projectRoot, selector.path, readFile, realpath);
        if (loaded.status === "error") {
            return {status: "load-error", error: loaded.message};
        }
        return {status: "ok", library: loaded.library, source: "json", importIssues: []};
    }

    if (selector.kind === "bundle") {
        const resolved = resolveProjectDirectory(projectRoot, selector.bundleDir, realpath);
        if (resolved.status === "error") {
            return {status: "load-error", error: resolved.message};
        }
        try {
            const manifest = await bundleReader.readManifest(resolved.resolvedPath);
            const library = await bundleReader.readLibrary(resolved.resolvedPath, selector.modeName);
            return {
                status: "ok",
                library,
                source: "bundle",
                envelope: {game: manifest.game, configHash: manifest.configHash, pokieVersion: manifest.artifactPokieVersion},
                importIssues: [],
            };
        } catch (error) {
            return {
                status: "load-error",
                error: `Could not read bundle "${selector.bundleDir}" mode "${selector.modeName}": ${error instanceof Error ? error.message : String(error)}`,
            };
        }
    }

    const resolved = resolveProjectDirectory(projectRoot, selector.stakeDir, realpath);
    if (resolved.status === "error") {
        return {status: "load-error", error: resolved.message};
    }

    let imported;
    try {
        imported = await stakeEngineImporter.importFromDirectory(resolved.resolvedPath);
    } catch (error) {
        return {status: "load-error", error: `Could not read Stake Engine export "${selector.stakeDir}": ${error instanceof Error ? error.message : String(error)}`};
    }
    const importErrors = imported.issues.filter((issue) => issue.severity === "error");
    if (importErrors.length > 0) {
        return {status: "load-error", error: importErrors.map((issue) => issue.message).join(" ")};
    }
    const mode = imported.modes.find((candidate) => candidate.modeName === selector.modeName);
    if (mode === undefined) {
        return {status: "load-error", error: `Mode "${selector.modeName}" was not found in Stake Engine export "${selector.stakeDir}".`};
    }
    return {
        status: "ok",
        library: mode.library,
        source: "stakeengine",
        envelope:
            imported.manifest !== undefined
                ? {game: imported.manifest.game, configHash: imported.manifest.configHash, pokieVersion: imported.manifest.pokieVersion}
                : undefined,
        importIssues: imported.issues,
    };
}
