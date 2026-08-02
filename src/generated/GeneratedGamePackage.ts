import type {GameBlueprintManifest} from "./GameBlueprint.js";

export type GeneratedGamePackage = {
    projectRoot: string;
    manifest: GameBlueprintManifest;
    createdFiles: string[];
};
