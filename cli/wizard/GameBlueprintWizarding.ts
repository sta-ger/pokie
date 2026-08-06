import type {PromptAdapting} from "./PromptAdapting.js";
import type {WizardResult} from "./WizardResult.js";

// Lets a caller steer two things without forking the question flow itself: which id/name the game id
// question offers as its own default (instead of minting a fresh random suggestion — see
// SlotGameNameGenerating), and how the final "where to save" question is worded/defaulted. Both are
// optional -- omitted, the wizard behaves exactly as it always has (a random id/name suggestion, and
// "Output directory [./<id>]").
export type GameBlueprintWizardOptions = {
    // e.g. "pokie create <name>"'s own given name -- pre-fills (not locks) the id and name questions'
    // own defaults, the same derivation applyBlueprintNameOverride uses elsewhere.
    presetName?: string;
    // Overrides the destination question's own wording/default -- omitted, it asks for a package
    // *directory* (the wizard's original default); "pokie create" (its only caller today) always
    // supplies this to ask for a blueprint *file* instead. Unlike the directory question (raw.length
    // === 0 resolves to WizardResult.outDir
    // undefined, left for the caller to default), a supplied destination always resolves to a concrete
    // path -- the caller already knows exactly what that default should be.
    destination?: {
        label: string;
        defaultPathFor: (id: string) => string;
    };
};

export interface GameBlueprintWizarding {
    // Interactively collects a GameBlueprint (and output dir) via "prompt". Resolves with null if the
    // user cancels partway through, instead of throwing — cancellation isn't an error.
    run(prompt: PromptAdapting, options?: GameBlueprintWizardOptions): Promise<WizardResult | null>;
}
