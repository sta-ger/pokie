import type {GameBlueprintInfo} from "./GameBlueprint.js";

export type GeneratedGamePackage = {
    projectRoot: string;
    info: GameBlueprintInfo;
    createdFiles: string[];
};
