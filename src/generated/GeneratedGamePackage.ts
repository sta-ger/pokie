import type {GameBlueprintManifest} from "./GameBlueprint.js";
import type {GameBuildInfo} from "./GameBuildInfo.js";

export type GeneratedGamePackage = {
    projectRoot: string;
    manifest: GameBlueprintManifest;
    createdFiles: string[];
    buildInfo: GameBuildInfo;
    // True when this run reused the previous build's generatedAt (see buildGameBuildInfo) — i.e. the
    // rebuild was a no-op: blueprint, pokie version, and source path all matched the prior run, so
    // every generated file came out byte-identical to what was already on disk.
    unchanged: boolean;
};
