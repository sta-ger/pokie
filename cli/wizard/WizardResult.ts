import type {GameBlueprint} from "pokie";

export type WizardResult = {
    blueprint: GameBlueprint;
    // Mirrors BuildCommand's "--out" — undefined means "use the generator's own default
    // (./<manifest.id>)". A caller that passed GameBlueprintWizardOptions.destination (see
    // GameBlueprintWizarding) gets a concrete path back here instead, never undefined -- e.g. "pokie
    // create"'s own blueprint *file* destination, rather than "pokie init"/"pokie build"'s package
    // *directory* one.
    outDir?: string;
};
