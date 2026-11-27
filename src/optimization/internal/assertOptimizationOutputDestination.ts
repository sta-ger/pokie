import path from "path";
import type {ProjectType} from "../../project/ProjectType.js";

const FILE_SUFFIX: Partial<Record<ProjectType, string>> = {
    blueprint: ".json",
    parWorkbook: ".xlsx",
    wasm: ".wasm",
};

/**
 * Rejects an --out path that cannot be reopened as the candidate's own project type.
 * Directory-style destinations are valid only for directory project types; file candidates need the
 * suffix their resolver recognizes (a Blueprint without ".json" is a perfectly valid file that POKIE
 * cannot recognize after publication).
 */
export function assertOptimizationOutputDestination(
    candidateType: ProjectType,
    destination: string,
    directory: boolean,
): void {
    if (directory) return;
    const suffix = FILE_SUFFIX[candidateType];
    if (suffix === undefined) return;
    if (path.extname(destination).toLowerCase() === suffix) return;
    throw new Error(
        `--out for a ${candidateType} candidate must be a file ending in "${suffix}" ` +
        `(for example "result${suffix}"); "${destination}" does not.`,
    );
}
