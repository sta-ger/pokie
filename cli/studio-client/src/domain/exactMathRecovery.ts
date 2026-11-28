import type {StudioJobView} from "../api/types.js";

function normalizePath(value: string): string {
    return value.replace(/\\/g, "/").replace(/\/+$/, "");
}

function projectDirectory(projectRoot: string): string {
    const normalized = normalizePath(projectRoot);
    if (!normalized.endsWith(".json")) return normalized;
    const slash = normalized.lastIndexOf("/");
    return slash === -1 ? normalized : normalized.slice(0, slash);
}

/**
 * Is an interrupted Outcome Library receipt already superseded by the exact table Studio is showing?
 *
 * The destination check matters: Build/Export can generate a table into a custom folder. If that
 * custom generation was interrupted while the project's default table is current, its receipt is
 * not superseded and must keep its Retry action.
 */
export function isSupersededExactOutcomeLibraryJob(
    job: StudioJobView,
    projectRoot: string,
    currentLibraryDir: string,
    currentModeName?: string,
): boolean {
    if (job.operation !== "outcome-library-generation" || job.status !== "recovery-required") return false;
    // A sampled/bounded job and a different bet mode are different products, not older attempts at the
    // exact default table. Leave their receipts and Retry actions alone.
    const generation = job.request.generation;
    if (typeof generation === "string" && generation !== "exact" && generation !== "default") return false;
    if (job.request.sample !== undefined) return false;
    const mode = job.request.mode;
    if (typeof mode === "string" && currentModeName !== undefined && mode !== currentModeName) return false;
    const destination = typeof job.request.destination === "string" ? normalizePath(job.request.destination) : undefined;
    if (destination === undefined) return true;
    return destination === normalizePath(`${projectDirectory(projectRoot)}/${currentLibraryDir}`);
}
