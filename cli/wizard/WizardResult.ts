import type {GameBlueprint} from "pokie";

export type WizardResult = {
    blueprint: GameBlueprint;
    // Mirrors BuildCommand's "--target" — undefined means "use the generator's own default
    // (./<manifest.id>)". A caller that passed GameBlueprintWizardOptions.destination (see
    // GameBlueprintWizarding) gets a concrete path back here instead, never undefined -- "pokie
    // create"'s own blueprint *file* destination, its only caller today.
    outDir?: string;
};
