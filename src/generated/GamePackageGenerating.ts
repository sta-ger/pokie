import type {GameBlueprint} from "./GameBlueprint.js";
import type {GeneratedGamePackage} from "./GeneratedGamePackage.js";

export interface GamePackageGenerating {
    generate(blueprint: GameBlueprint, cwd: string, outDir?: string): GeneratedGamePackage;
}
