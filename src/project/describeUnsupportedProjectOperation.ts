import {OPERATION_REQUIRED_CAPABILITY, type PokieOperation} from "./PokieOperation.js";
import {PROJECT_TYPE_CAPABILITIES} from "./ProjectCapabilities.js";
import type {PokieProject} from "./PokieProject.js";
import type {ProjectType} from "./ProjectType.js";
import type {UnsupportedProjectOperationDiagnostic} from "./UnsupportedProjectOperationDiagnostic.js";

const ALL_PROJECT_TYPES = Object.keys(PROJECT_TYPE_CAPABILITIES) as ProjectType[];

// Checks whether `project` can perform `operation` and, if not, explains why — the single place this
// question gets answered, so a command or Studio service reports the same missing-capability/alternatives
// pair a user would get anywhere else in POKIE, rather than each call site inventing its own "unsupported"
// message. Returns undefined when the operation is supported, or when `operation` isn't one
// OPERATION_REQUIRED_CAPABILITY recognizes at all (nothing to check it against).
export function describeUnsupportedProjectOperation(
    project: PokieProject,
    operation: PokieOperation,
): UnsupportedProjectOperationDiagnostic | undefined {
    const requiredCapability = OPERATION_REQUIRED_CAPABILITY[operation];
    if (requiredCapability === undefined || project.capabilities.includes(requiredCapability)) {
        return undefined;
    }

    const alternatives = ALL_PROJECT_TYPES.filter(
        (type) => type !== project.type && PROJECT_TYPE_CAPABILITIES[type].includes(requiredCapability),
    );

    const alternativesText =
        alternatives.length > 0 ? ` Supported by: ${alternatives.join(", ")}.` : " No project type currently supports it.";

    return {
        detectedType: project.type,
        operation,
        missingCapability: requiredCapability,
        alternatives,
        message: `"${operation}" is not supported for a "${project.type}" project (missing the "${requiredCapability}" capability).${alternativesText}`,
    };
}
