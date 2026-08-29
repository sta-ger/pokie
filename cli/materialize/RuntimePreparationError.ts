import type {PokieProject, RunnableRuntimePlan} from "pokie";

/**
 * A safe, caller-facing account of a failed runnable-runtime plan.  The
 * original error remains available as `cause` (and its npm details remain on
 * `details`) while every adapter gets the same attempted path and edge.
 */
export class RuntimePreparationError extends Error {
    public readonly details?: string;

    public constructor(project: PokieProject, plan: RunnableRuntimePlan, cause: unknown) {
        const failedStep = project.type === "parWorkbook" && !isBlueprintMaterializationError(cause)
            ? plan.steps[0]
            : plan.steps[plan.steps.length - 1];
        const stages = plan.steps.length === 0
            ? "none"
            : plan.steps.map((step) => `${step.choice} ${step.kind} (${step.input.kind} -> ${step.output.kind})`).join(", ");
        const reason = cause instanceof Error ? cause.message : String(cause);
        super(
            `Cannot prepare a runnable runtime from ${JSON.stringify(project.rootPath)}. ` +
            `Attempted path: ${project.type} -> tsPackage; planned/reusable stages: ${stages}; ` +
            `failed conversion edge: ${failedStep.input.kind} -> ${failedStep.output.kind}. ${reason}`,
        );
        this.name = "RuntimePreparationError";
        (this as Error & {cause?: unknown}).cause = cause;
        this.details = detailsOf(cause);
    }
}

function isBlueprintMaterializationError(error: unknown): error is {name: string} {
    return error instanceof Error && error.name === "BlueprintMaterializationError";
}

function detailsOf(error: unknown): string | undefined {
    return typeof error === "object" && error !== null && "details" in error && typeof error.details === "string"
        ? error.details
        : undefined;
}
