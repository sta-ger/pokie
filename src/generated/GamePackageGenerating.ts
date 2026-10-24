import type {GameBlueprint} from "./GameBlueprint.js";
import type {GameBuildInfoReelStripGeneration} from "./GameBuildInfoReelStripGeneration.js";
import type {GeneratedGamePackage} from "./GeneratedGamePackage.js";

// Kept at the generated-package boundary so callers which publish a package through a builder can
// observe and stop the real file loop, rather than only checking either side of an opaque generate().
export type GamePackageGenerateOptions = {
    // Supplied by the CLI/Studio composition root, never inferred from Blueprint content.
    // Keep the same local dependency for immediate execution and subsequent npm installs.
    readonly runtimePackageRoot?: string;
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
