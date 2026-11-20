import type {GameBlueprintInfo} from "./GameBlueprint.js";

export type GeneratedGamePackage = {
    projectRoot: string;
    manifest: GameBlueprintInfo;
    createdFiles: string[];
};
