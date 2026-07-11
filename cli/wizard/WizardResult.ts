import type {GameBlueprint} from "pokie";

export type WizardResult = {
    blueprint: GameBlueprint;
    // Mirrors BuildCommand's "--out" — undefined means "use the generator's own default (./<manifest.id>)".
    outDir?: string;
};
