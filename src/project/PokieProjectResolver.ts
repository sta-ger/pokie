import fs from "fs";
import path from "path";
import {readPokiePackageConfig} from "../gamepackage/readPokiePackageConfig.js";
import {isRecognizedStakeEngineExportDirectory} from "../stakeengine/isRecognizedStakeEngineExportDirectory.js";
import {isOutcomeLibraryBundleDirectory} from "./internal/isOutcomeLibraryBundleDirectory.js";
import {looksLikeGameBlueprintFile} from "./internal/looksLikeGameBlueprintFile.js";
import type {PokieProject} from "./PokieProject.js";
import {PROJECT_TYPE_CAPABILITIES} from "./ProjectCapabilities.js";
import type {ProjectResolving} from "./ProjectResolving.js";
import type {ProjectType} from "./ProjectType.js";

function toProject(type: ProjectType, rootPath: string): PokieProject {
    return {type, rootPath, capabilities: PROJECT_TYPE_CAPABILITIES[type]} as PokieProject;
}

function isPokieTsPackageDirectory(dir: string): boolean {
    try {
        readPokiePackageConfig(dir);
        return true;
    } catch {
        return false;
    }
}

// The default ProjectResolving: resolves a single given path against the same on-disk facts POKIE's own
// tooling already recognizes elsewhere (readPokiePackageConfig's "pokie.entry" contract,
// isRecognizedStakeEngineExportDirectory's manifest check) plus this module's own outcome-library-bundle/
// blueprint recognition, rather than each command re-deriving its own "what kind of thing is this path"
// answer. Deliberately resolves exactly `targetPath` — it does not walk up looking for an ancestor project
// root the way findPokieProjectRoot does; that remains findPokieProjectRoot's own, narrower job (finding a
// tsPackage root from a nested subdirectory), layered on top of this resolver rather than duplicated into it.
export class PokieProjectResolver implements ProjectResolving {
    public async resolve(targetPath: string): Promise<PokieProject | undefined> {
        const resolved = path.resolve(targetPath);

        let stat: fs.Stats;
        try {
            stat = await fs.promises.stat(resolved);
        } catch {
            return undefined;
        }

        if (stat.isDirectory()) {
            return this.resolveDirectory(resolved);
        }
        if (stat.isFile()) {
            return this.resolveFile(resolved);
        }
        return undefined;
    }

    private resolveDirectory(dir: string): PokieProject | undefined {
        if (isPokieTsPackageDirectory(dir)) {
            return toProject("tsPackage", dir);
        }
        if (isRecognizedStakeEngineExportDirectory(dir)) {
            return toProject("stakeAdapter", dir);
        }
        if (isOutcomeLibraryBundleDirectory(dir)) {
            return toProject("outcomeLibrary", dir);
        }
        return undefined;
    }

    private resolveFile(file: string): PokieProject | undefined {
        const extension = path.extname(file).toLowerCase();

        if (extension === ".xlsx") {
            return toProject("parWorkbook", file);
        }
        if (extension === ".wasm") {
            return toProject("wasm", file);
        }
        if (extension === ".json" && looksLikeGameBlueprintFile(file)) {
            return toProject("blueprint", file);
        }
        return undefined;
    }
}
