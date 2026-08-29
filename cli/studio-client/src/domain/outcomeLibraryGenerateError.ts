// Subject-specific copy for the Generate/Estimate steps' own "unsupported"/"generation-error" statuses --
// see WeightedOutcomeLibraryGenerationError's own doc comment for the full code list this reads. Unlike
// pathActionError.ts/runtimeActionError.ts (which classify a raw fetch/fs exception string), these two
// statuses are already server-classified domain outcomes (never a thrown exception reaching the client),
// so there's no message-sniffing here -- "unsupported" always means the same thing (the loaded game's own
// mechanic can't be exactly enumerated at all), and "generation-error" is keyed on its own explicit `code`.
// Both keep the server's own message available via AdvancedDisclosure at the call site, never dropped --
// same "hand-authored primary explanation, raw detail behind disclosure" convention Runtime's blocked/
// conflict and Replay's mid-run job failure already use.

export const OUTCOME_LIBRARY_UNSUPPORTED_EXPLANATION =
    "This game's own mechanic can't be exactly enumerated -- it's stateful, unbounded, or simply hasn't implemented exact enumeration. " +
    "There is no bounded/sampled fallback for this; verify this game's odds through Simulation & Reports instead.";

type GenerationErrorCopy = {status: string; remediation: string};

const GENERATION_ERROR_COPY: Record<string, GenerationErrorCopy> = {
    "weighted-outcome-library-generation-space-exceeded": {
        status: "This outcome space is too large to generate exactly.",
        remediation: 'Raise "Max outcome space size" above, or check "Bounded coverage" and set a sample size, then try again.',
    },
    "weighted-outcome-library-generation-weight-not-representable": {
        status: "One of this library's outcome weights can't be represented exactly.",
        remediation: "This points to a mechanic or configuration issue in the game. Review the game model, correct it, and generate again.",
    },
    "weighted-outcome-library-generation-session-not-playable": {
        status: "The game session became unplayable partway through generation.",
        remediation: "This points to a mechanic or configuration issue in the game. Review the game model, correct it, and generate again.",
    },
};

const GENERATION_ERROR_FALLBACK: GenerationErrorCopy = {
    status: "Generating this outcome library failed.",
    remediation: "Check the settings above and try again. If it continues, reopen the project and retry.",
};

export function describeOutcomeLibraryGenerationErrorExplanation(code: string): string {
    const {status, remediation} = GENERATION_ERROR_COPY[code] ?? GENERATION_ERROR_FALLBACK;
    return `${status} ${remediation}`;
}

/**
 * Server terminal states are already classified. Keep their recovery copy in
 * this domain model so the UI never turns a lifecycle result back into an
 * unclassified raw transport message.
 */
export function describeOutcomeLibraryGenerationTerminalOutcome(result: {
    readonly status: "unsupported" | "conflict" | "generation-error" | "invalid" | "load-error" | "cancelled" | "requires-bounded";
    readonly code?: string;
    readonly errors?: readonly {readonly message: string}[];
    readonly recovery?: string;
}): string {
    if (result.status === "requires-bounded") return 'This outcome space is too large for the exact limit shown above. Select "Sampled" or "Conditional bounded", enter a sample size and deterministic seed, then refresh the preflight.';
    if (result.status === "unsupported") return `${OUTCOME_LIBRARY_UNSUPPORTED_EXPLANATION} Choose Simulation & Reports for this game instead.`;
    if (result.status === "conflict") return "The project, configuration, destination, or bound preflight changed before publication. Refresh the preflight, review the destination, then generate again.";
    if (result.status === "generation-error") return describeOutcomeLibraryGenerationErrorExplanation(result.code ?? "");
    if (result.status === "invalid") return "The generated bundle did not pass validation. Review the game configuration and generate again.";
    if (result.status === "cancelled") return result.recovery ?? "Generation was cancelled safely. Resume the exact checkpoint only after reloading the unchanged project and preflight.";
    return "The project could not be loaded for outcome-library generation. Reopen or rebuild the project, then refresh the preflight.";
}
