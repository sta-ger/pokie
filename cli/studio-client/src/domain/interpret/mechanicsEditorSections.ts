import type {ValidationIssue} from "../../api/types";
import type {BlueprintValidationView} from "./BlueprintEditor";

// Same role as BlueprintSections.ts's own doc comment: a pure, display-only mapping of the server's
// already-computed, flat ValidationIssue[] onto the Mechanics Editor's own step grouping (Layout &
// symbols / Win model & paytable / Mechanics & features / Bet modes) -- never a re-implementation of
// any check. Kept independent from BlueprintSections.ts (a different grouping for a different guided
// flow) so the existing Home "Design & Build" editor's own section list is untouched.
export type MechanicsEditorStepId = "layoutSymbols" | "winModelPaytable" | "mechanicsFeatures" | "betModes";

export const MECHANICS_EDITOR_STEPS: {id: MechanicsEditorStepId; label: string}[] = [
    {id: "layoutSymbols", label: "Layout & symbols"},
    {id: "winModelPaytable", label: "Win model & paytable"},
    {id: "mechanicsFeatures", label: "Mechanics & features"},
    {id: "betModes", label: "Bet modes"},
];

const STEP_CODE_PREFIXES: Record<MechanicsEditorStepId, string[]> = {
    layoutSymbols: ["blueprint-reels-", "blueprint-rows-", "blueprint-symbols-", "blueprint-wilds-", "blueprint-scatters-", "blueprint-reelstrip", "blueprint-symbolweights-", "blueprint-weighting-"],
    winModelPaytable: ["blueprint-winmodel-", "blueprint-paylines-", "blueprint-payline-", "blueprint-paytable-", "blueprint-symbol-missing-payout"],
    mechanicsFeatures: ["blueprint-mechanics-"],
    betModes: ["blueprint-availablebets-", "blueprint-betmode-"],
};

function stepForIssue(issue: ValidationIssue): MechanicsEditorStepId | undefined {
    return MECHANICS_EDITOR_STEPS.map((step) => step.id).find((id) => STEP_CODE_PREFIXES[id].some((prefix) => issue.code.startsWith(prefix)));
}

export function classifyIssuesByStep(issues: ValidationIssue[]): {
    byStep: Record<MechanicsEditorStepId, ValidationIssue[]>;
    // Safety net for any code that doesn't match a known prefix (e.g. "blueprint-not-object",
    // "blueprint-manifest-*" -- this editor never touches the manifest -- or a future validator rule
    // this mapping hasn't been taught about yet) -- never silently dropped, always shown on the
    // Validate step alongside everything else.
    unclassified: ValidationIssue[];
} {
    const byStep = Object.fromEntries(MECHANICS_EDITOR_STEPS.map((step) => [step.id, [] as ValidationIssue[]])) as Record<
        MechanicsEditorStepId,
        ValidationIssue[]
    >;
    const unclassified: ValidationIssue[] = [];
    for (const issue of issues) {
        const step = stepForIssue(issue);
        if (step) {
            byStep[step].push(issue);
        } else {
            unclassified.push(issue);
        }
    }
    return {byStep, unclassified};
}

export type MechanicsEditorStepStatus = {tone: "neutral" | "success" | "warning" | "error"; errorCount: number; warningCount: number};

// Same "neutral before a real result exists" rule as BlueprintSections.ts's describeSectionStatus.
export function describeStepStatus(stepId: MechanicsEditorStepId, view: BlueprintValidationView): MechanicsEditorStepStatus {
    if (view.status === "idle" || view.status === "loading" || view.status === "error") {
        return {tone: "neutral", errorCount: 0, warningCount: 0};
    }
    const allIssues = view.status === "invalid" ? [...view.errors, ...view.warnings] : view.warnings;
    const {byStep} = classifyIssuesByStep(allIssues);
    const issues = byStep[stepId];
    const errorCount = issues.filter((issue) => issue.severity === "error").length;
    const warningCount = issues.length - errorCount;
    if (errorCount > 0) {
        return {tone: "error", errorCount, warningCount};
    }
    if (warningCount > 0) {
        return {tone: "warning", errorCount: 0, warningCount};
    }
    return {tone: "success", errorCount: 0, warningCount: 0};
}
