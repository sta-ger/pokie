import type {AdvancedModelValidationReport} from "../../../../src/validation/AdvancedModelValidation.js";
import type {BlueprintValidationView} from "./interpret/BlueprintEditor";
import type {ProjectValidationView} from "./interpret/ProjectDashboard";

// The guided editor used to show one "Design valid" badge while a separate feature check could still
// warn that a game's free-games retrigger series was not proven to terminate. Those are different
// questions: structure asks whether the JSON/model is well formed, while math asks whether the payout
// model is balanced and every feature path is bounded. Keep the two scopes visibly separate wherever
// a reader might otherwise read "valid" as "the math is safe".
export type ValidationScope = "structure" | "math";

export type ValidationScopeBadge = {
    scope: ValidationScope;
    label: string;
    color: string;
    detail: string;
};

/** What the saved project's exact outcome table currently says about its math. */
export type ProjectMathStatus = "loading" | "missing" | "stale" | "ok" | "error";

/** The termination check is a math/feature finding, never a structural validation error. */
export function hasFeatureTerminationWarning(advanced: AdvancedModelValidationReport | undefined): boolean {
    return advanced?.checks.some((check) => check.id === "termination.free-games" && check.status === "violation") === true;
}

function blueprintStructureBadge(view: BlueprintValidationView): ValidationScopeBadge {
    switch (view.status) {
        case "ok":
            return {scope: "structure", label: "Structure: valid", color: "green", detail: "The game-design format and required fields are valid."};
        case "invalid":
            return {scope: "structure", label: "Structure: errors", color: "red", detail: "Fix the format/field errors before saving the design."};
        case "inconclusive":
            return {scope: "structure", label: "Structure: inconclusive", color: "yellow", detail: "The structural check could not reach a verdict; review its limits before saving."};
        case "error":
            return {scope: "structure", label: "Structure: check failed", color: "red", detail: "Studio could not complete the structural check. Retry validation."};
        case "loading":
        case "stale":
            return {scope: "structure", label: "Structure: checking", color: "blue", detail: "Studio is checking the current design."};
        default:
            return {scope: "structure", label: "Structure: not checked", color: "gray", detail: "Edit the design to start the automatic structural check."};
    }
}

function blueprintMathBadge(
    view: BlueprintValidationView,
    mathStatus: "idle" | "loading" | "ok" | "unavailable" | "error",
): ValidationScopeBadge {
    if (view.status === "ok" && hasFeatureTerminationWarning(view.advanced)) {
        return {
            scope: "math",
            label: "Math: uncapped free games",
            color: "yellow",
            detail: "Free games can retrigger without a hard cap, so one round may never end. The RTP shown is an average, not a guaranteed limit.",
        };
    }
    if (mathStatus === "ok") {
        return {
            scope: "math",
            label: "Math: exact preview available",
            color: "blue",
            detail: "The draft has an exact preview. This does not by itself mean the RTP target or payout shape is right for your market.",
        };
    }
    if (mathStatus === "loading") {
        return {scope: "math", label: "Math: checking", color: "blue", detail: "Calculating the exact draft preview."};
    }
    if (mathStatus === "unavailable" || mathStatus === "error") {
        return {scope: "math", label: "Math: preview unavailable", color: "yellow", detail: "The exact draft preview did not complete. Review Math preview and retry before treating the model as checked."};
    }
    return {
        scope: "math",
        label: "Math: not checked",
        color: "gray",
        detail: "Structure does not establish RTP, payout distribution or feature termination. Use Calculate exact math to check the draft.",
    };
}

export function describeBlueprintValidationScopes(
    view: BlueprintValidationView,
    mathStatus: "idle" | "loading" | "ok" | "unavailable" | "error",
): ValidationScopeBadge[] {
    return [blueprintStructureBadge(view), blueprintMathBadge(view, mathStatus)];
}

export function describeProjectValidationScopes(
    view: ProjectValidationView,
    mathStatus: ProjectMathStatus = "missing",
    exactMathSupported = true,
): ValidationScopeBadge[] {
    let structure: ValidationScopeBadge;
    if (view.status === "success" && view.summary.advanced?.structuralValid === null) {
        structure = {scope: "structure", label: "Structure: inconclusive", color: "yellow", detail: "The structural analysis hit a limit and did not reach a verdict."};
    } else if (view.status === "success" && view.summary.valid) {
        structure = {scope: "structure", label: "Structure: valid", color: "green", detail: "The project format and required fields are valid."};
    } else if (view.status === "success") {
        structure = {scope: "structure", label: "Structure: errors", color: "red", detail: "Fix the project errors before relying on this build."};
    } else if (view.status === "error") {
        structure = {scope: "structure", label: "Structure: check failed", color: "red", detail: "The structural check could not be completed. Retry validation."};
    } else {
        structure = {scope: "structure", label: "Structure: checking", color: "blue", detail: "Studio is checking the project."};
    }

    const mathWarning = view.status === "success" && hasFeatureTerminationWarning(view.summary.advanced);
    let math: ValidationScopeBadge;
    if (mathWarning) {
        math = {
            scope: "math",
            label: "Math: uncapped free games",
            color: "yellow",
            detail: "Free games can retrigger without a hard cap, so one round may never end. The displayed RTP is an average, not a guaranteed limit.",
        };
    } else if (mathStatus === "ok") {
        math = {
            scope: "math",
            label: "Math: exact (not certified)",
            color: "blue",
            detail: "An exact outcome table exists for the current saved design. Exact math is not certification; independent sign-off is still required for real-money use.",
        };
    } else if (mathStatus === "stale") {
        math = {
            scope: "math",
            label: "Math: numbers out of date",
            color: "yellow",
            detail: "The saved design changed after its exact outcome table was generated. Recompute it before treating its numbers as current.",
        };
    } else if (mathStatus === "loading") {
        math = {
            scope: "math",
            label: "Math: computing exact table",
            color: "blue",
            detail: "Studio is reading or generating the saved design's exact outcome table.",
        };
    } else if (mathStatus === "error") {
        math = {
            scope: "math",
            label: "Math: exact table unavailable",
            color: "yellow",
            detail: "Studio could not read the exact outcome table. Retry the read on Overview; a simulation remains only an estimate.",
        };
    } else if (!exactMathSupported) {
        math = {
            scope: "math",
            label: "Math: exact math unavailable",
            color: "gray",
            detail: "This package does not implement createExactEnumerationSession(), so Studio cannot enumerate an exact outcome table for it. Use Simulation for a sampled estimate; the structural check does not establish RTP or payout balance.",
        };
    } else {
        math = {
            scope: "math",
            label: "Math: not checked",
            color: "gray",
            detail: "No exact outcome table exists for this saved design yet. Use Compute exact outcome table on Overview, or Simulation for a sampled estimate. The structural check does not establish RTP or payout balance.",
        };
    }
    return [structure, math];
}
