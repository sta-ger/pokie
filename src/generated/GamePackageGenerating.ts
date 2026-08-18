import type {GameBlueprint} from "./GameBlueprint.js";
import type {GameBuildInfoReelStripGeneration} from "./GameBuildInfoReelStripGeneration.js";
import type {GeneratedGamePackage} from "./GeneratedGamePackage.js";

// Kept at the generated-package boundary so callers which publish a package through a builder can
// observe and stop the real file loop, rather than only checking either side of an opaque generate().
export type GamePackageGenerateOptions = {
    readonly signal?: AbortSignal;
    readonly onProgress?: (progress: {readonly completed: number; readonly total: number; readonly message: string}) => void;
};

export interface GamePackageGenerating {
    generate(
        blueprint: GameBlueprint,
        cwd: string,
        outDir?: string,
        reelStripGeneration?: GameBuildInfoReelStripGeneration,
        options?: GamePackageGenerateOptions,
    ): GeneratedGamePackage;
}
