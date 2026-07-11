import type {PromptAdapting} from "./PromptAdapting.js";
import type {WizardResult} from "./WizardResult.js";

export interface GameBlueprintWizarding {
    // Interactively collects a GameBlueprint (and output dir) via "prompt". Resolves with null if the
    // user cancels partway through, instead of throwing — cancellation isn't an error.
    run(prompt: PromptAdapting): Promise<WizardResult | null>;
}
