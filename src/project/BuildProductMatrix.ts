import type {ArtifactTargetType} from "./ArtifactTargetType.js";
import type {ProjectType} from "./ProjectType.js";

// The build product contract is deliberately data, rather than a collection of capability checks spread
// across the CLI, registry and Studio.  It includes every resolver source kind and every artifact target;
// `hidden/unadvertised` is a real state so inspection-only kinds can never accidentally appear as build
// choices just because they are part of ArtifactTargetType.
export type BuildProductMatrixCellState = "supported" | "diagnostic-required" | "hidden/unadvertised";

export type BuildProductMatrixCell = {
    readonly source: ProjectType;
    readonly target: ArtifactTargetType;
    readonly state: BuildProductMatrixCellState;
    readonly missingPrerequisite?: string;
    readonly nextAction?: string;
};

export const BUILD_PRODUCT_MATRIX_SOURCE_TYPES: readonly ProjectType[] = [
    "blueprint",
    "tsPackage",
    "outcomeLibrary",
    "stakeAdapter",
    "parWorkbook",
    "wasm",
];

export const BUILD_PRODUCT_MATRIX_TARGETS: readonly ArtifactTargetType[] = [
    "tsPackage",
    "outcomeLibrary",
    "stakeAdapter",
    "parWorkbook",
    "wasm",
];

// These are the only targets a user can select in `pokie build` and Studio. WASM remains a resolved,
// inspectable project type, but no source can build it and presenting it as a build target would be dead UX.
export const ADVERTISED_ARTIFACT_BUILD_TARGETS: readonly ArtifactTargetType[] = [
    "tsPackage",
    "outcomeLibrary",
    "stakeAdapter",
    "parWorkbook",
];

const PUBLIC_PROJECT_TYPE_NAMES: Readonly<Record<ProjectType, string>> = {
    blueprint: "Game Blueprint",
    tsPackage: "POKIE game package",
    outcomeLibrary: "Outcome Library",
    stakeAdapter: "Stake Engine export",
    parWorkbook: "PAR workbook",
    wasm: "POKIE WASM component",
};

const TARGET_PREREQUISITES: Readonly<Record<ArtifactTargetType, {missingPrerequisite: string; nextAction: string}>> = {
    tsPackage: {
        missingPrerequisite: "a Game Blueprint source",
        nextAction: "Open a Game Blueprint, then run `pokie build <path> --target tsPackage`.",
    },
    outcomeLibrary: {
        missingPrerequisite: "a Game Blueprint, POKIE game package, or Outcome Library",
        nextAction: "Open one of those sources, then run `pokie build <path> --target outcomeLibrary`.",
    },
    stakeAdapter: {
        missingPrerequisite: "a Game Blueprint, POKIE game package, Outcome Library, or Stake Engine export",
        nextAction: "Open one of those sources, then run `pokie build <path> --target stakeAdapter`.",
    },
    parWorkbook: {
        missingPrerequisite: "a PAR workbook",
        nextAction: "Open a PAR workbook, then run `pokie build <path> --target parWorkbook`.",
    },
    wasm: {
        missingPrerequisite: "a WASM artifact builder",
        nextAction: "WASM builds are not available; run `pokie inspect <path>` to inspect a compatible component.",
    },
};

const SUPPORTED_CELLS = new Set<string>([
    "blueprint:tsPackage",
    "blueprint:outcomeLibrary",
    "blueprint:stakeAdapter",
    "tsPackage:outcomeLibrary",
    "tsPackage:stakeAdapter",
    "outcomeLibrary:outcomeLibrary",
    "outcomeLibrary:stakeAdapter",
    "stakeAdapter:stakeAdapter",
    "parWorkbook:parWorkbook",
]);

function cellKey(source: ProjectType, target: ArtifactTargetType): string {
    return `${source}:${target}`;
}

function buildCell(source: ProjectType, target: ArtifactTargetType): BuildProductMatrixCell {
    if (target === "wasm") {
        return {source, target, state: "hidden/unadvertised", ...TARGET_PREREQUISITES.wasm};
    }
    if (SUPPORTED_CELLS.has(cellKey(source, target))) {
        return {source, target, state: "supported"};
    }
    return {source, target, state: "diagnostic-required", ...TARGET_PREREQUISITES[target]};
}

export const BUILD_PRODUCT_MATRIX: Readonly<Record<ProjectType, Readonly<Record<ArtifactTargetType, BuildProductMatrixCell>>>> =
    Object.freeze(
        Object.fromEntries(
            BUILD_PRODUCT_MATRIX_SOURCE_TYPES.map((source) => [
                source,
                Object.freeze(Object.fromEntries(BUILD_PRODUCT_MATRIX_TARGETS.map((target) => [target, Object.freeze(buildCell(source, target))]))),
            ]),
        ),
    ) as Readonly<Record<ProjectType, Readonly<Record<ArtifactTargetType, BuildProductMatrixCell>>>>;

export function getBuildProductMatrixCell(source: ProjectType, target: ArtifactTargetType): BuildProductMatrixCell {
    return BUILD_PRODUCT_MATRIX[source][target];
}

export function isAdvertisedArtifactBuildTarget(target: ArtifactTargetType): boolean {
    return ADVERTISED_ARTIFACT_BUILD_TARGETS.includes(target);
}

// Shared public diagnostic for CLI, direct-library consumers and Studio. Keeping names, missing data and
// next action here prevents a supported target from acquiring a second, stale explanation elsewhere.
export function describeBuildProductMatrixDiagnostic(source: ProjectType, target: ArtifactTargetType, sourcePath?: string): string {
    const cell = getBuildProductMatrixCell(source, target);
    const sourceDescription = sourcePath === undefined ? `A ${PUBLIC_PROJECT_TYPE_NAMES[source]}` : `"${sourcePath}" is a ${PUBLIC_PROJECT_TYPE_NAMES[source]}`;
    const targetDescription = PUBLIC_PROJECT_TYPE_NAMES[target];
    const prefix = cell.state === "hidden/unadvertised"
        ? `${sourceDescription}. ${targetDescription} is hidden from build selection because POKIE has no WASM artifact builder.`
        : `${sourceDescription}. It cannot build a ${targetDescription}. Missing prerequisite: ${cell.missingPrerequisite}.`;
    return `${prefix} Next: ${cell.nextAction}`;
}
