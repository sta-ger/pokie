import {OPERATION_REQUIRED_CAPABILITY, type PokieOperation} from "./PokieOperation.js";
import {PROJECT_TYPE_CAPABILITIES} from "./ProjectCapabilities.js";
import type {PokieProject} from "./PokieProject.js";
import {describeProjectType} from "./ProjectPresentation.js";
import type {ProjectType} from "./ProjectType.js";
import type {UnsupportedProjectOperationDiagnostic} from "./UnsupportedProjectOperationDiagnostic.js";

const ALL_PROJECT_TYPES = Object.keys(PROJECT_TYPE_CAPABILITIES) as ProjectType[];

const OPERATION_NAMES: Readonly<Record<string, string>> = {
    build: "build a POKIE game package",
    sim: "simulate game rounds",
    replay: "replay a game round",
    validate: "validate the game",
    edit: "edit the Game Blueprint",
    inspect: "inspect the game package",
    serve: "run a local game server",
    dev: "run the local development server",
    client: "open the game client",
    studio: "open POKIE Studio",
    "outcomeLibrary.generate": "generate an Outcome Library",
    "outcomeLibrary.build": "build an Outcome Library",
    "outcomeLibrary.validate": "validate an Outcome Library",
    "stakeEngine.export": "export for Stake Engine",
    "stakeEngine.import": "import a Stake Engine export",
    "stakeEngine.analyze": "analyze a Stake Engine export",
    "stakeEngine.diff": "compare Stake Engine exports",
    "par.import": "import a PAR workbook",
    "par.export": "export a PAR workbook",
    "wasm.export": "build a WASM component",
    "wasm.inspect": "inspect WASM component metadata",
    "wasm.packagingPreflight": "check a package for WASM packaging",
    "outcomeSource.inspect": "inspect outcome data",
    "outcomeSource.analyze": "analyze outcome data",
    "outcomeSource.sample": "sample an outcome",
    "outcomeSource.serve": "serve pre-generated outcomes",
    "outcomeSource.replay": "replay a pre-generated outcome",
    "outcomeSource.simulate": "simulate pre-generated outcomes",
    "outcomeSource.diff": "compare outcome sources",
    "certification.build": "build certification evidence",
    "certification.verify": "verify certification evidence",
};

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

    const action = OPERATION_NAMES[operation] ?? "perform this action";
    const alternativesText =
        alternatives.length > 0
            ? ` You can ${action} with ${alternatives.map(describeProjectType).join(" or ")}.`
            : ` POKIE cannot ${action} for any project yet.`;

    return {
        detectedType: project.type,
        operation,
        missingCapability: requiredCapability,
        alternatives,
        message: `This ${describeProjectType(project.type)} cannot ${action}.${alternativesText} Run "pokie inspect <path>" to see available next actions.`,
    };
}
