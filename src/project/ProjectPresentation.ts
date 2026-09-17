import type {PokieProject} from "./PokieProject.js";
import type {ProjectType} from "./ProjectType.js";
import {
    WASM_CANONICAL_ARTIFACT_CAPABILITY,
    WASM_RUNTIME_PLAY_CAPABILITY,
    WASM_RUNTIME_REPLAY_CAPABILITY,
} from "./ProjectCapability.js";
import {WASM_PRODUCT_CONTRACT} from "./WasmProductContract.js";

export type ProjectNextAction = {
    readonly label: string;
    readonly command: string;
};

export type ProjectPresentation = {
    readonly kind: string;
    readonly purpose: string;
    readonly nextActions: readonly ProjectNextAction[];
    readonly prerequisites: readonly string[];
};

const PROJECT_PRESENTATIONS: Readonly<Record<ProjectType, ProjectPresentation>> = {
    blueprint: {
        kind: "Game Blueprint",
        purpose: "A game design source that POKIE can turn into runnable game software or pre-generated outcomes.",
        nextActions: [
            {label: "Build a POKIE game package", command: "pokie build <path> --target tsPackage"},
            {label: "Build an Outcome Library", command: "pokie build <path> --target outcomeLibrary"},
            {label: "Export for Stake Engine", command: "pokie build <path> --target stakeAdapter"},
            {label: "Export a PAR workbook", command: "pokie par export <path>"},
        ],
        prerequisites: [
            "To validate, simulate, replay, or serve the game, first build a POKIE game package.",
        ],
    },
    tsPackage: {
        kind: "POKIE game package",
        purpose: "A runnable game package.",
        nextActions: [
            {label: "Validate the game", command: "pokie validate <path>"},
            {label: "Simulate game rounds", command: "pokie sim <path> --rounds 10000 --seed demo"},
            {label: "Replay one round", command: "pokie replay <path> --round 1 --seed demo"},
            {label: "Run a local game server", command: "pokie serve <path>"},
            {label: "Build an Outcome Library", command: "pokie build <path> --target outcomeLibrary"},
        ],
        prerequisites: [],
    },
    outcomeLibrary: {
        kind: "Outcome Library",
        purpose: "A pre-generated source of game outcomes that can be checked, analyzed, sampled, simulated, or served.",
        nextActions: [
            {label: "Validate the outcome data", command: "pokie validate <path> --deep"},
            {label: "Render exact outcome statistics", command: "pokie report <path>"},
            {label: "Simulate outcome draws", command: "pokie sim <path> --rounds 10000 --mode <modeName> --seed demo"},
            {label: "Run a local outcome server", command: "pokie serve <path> --mode <modeName>"},
            {label: "Export for Stake Engine", command: "pokie build <path> --target stakeAdapter"},
        ],
        prerequisites: [
            "A POKIE game package is required to run the original game logic; an Outcome Library serves its pre-generated outcomes instead.",
        ],
    },
    stakeAdapter: {
        kind: "Stake Engine export",
        purpose: "A Stake Engine-format export of pre-generated outcomes.",
        nextActions: [
            {label: "Render exact outcome statistics", command: "pokie report <path>"},
            {label: "Compare it with another outcome source", command: "pokie diff <path> <otherPath>"},
        ],
        prerequisites: [
            "To sample, simulate, replay, or serve outcomes, use the compatible Outcome Library that produced this export.",
            "To run or validate game logic, use a POKIE game package.",
        ],
    },
    wasm: {
        kind: WASM_PRODUCT_CONTRACT.kind,
        purpose: "A self-describing POKIE WASM component. Canonical components are integrity checked before POKIE uses each declared operation.",
        nextActions: [],
        prerequisites: ["Legacy sidecar-only components remain inspectable but must be rebuilt as canonical POKIE WASM artifacts before they can run."],
    },
    parWorkbook: {
        kind: "PAR workbook",
        purpose: "A PAR spreadsheet workbook that can be imported into a Game Blueprint.",
        nextActions: [{label: "Import a Game Blueprint", command: "pokie par import <path>"}],
        prerequisites: [
            "To build, validate, simulate, or run a game, first import the workbook into a Game Blueprint and build a POKIE game package.",
        ],
    },
};

export function describeProjectType(type: ProjectType): string {
    return PROJECT_PRESENTATIONS[type].kind;
}

export function describeProjectPresentation(project: PokieProject): ProjectPresentation {
    if (project.type === "wasm") {
        return describeWasmProjectPresentation(project);
    }
    return PROJECT_PRESENTATIONS[project.type];
}

// Canonical bytes prove the component identity and host contract, but do not grant every portable
// operation. Keep inspection guidance on the same resolved capability set the command handlers use:
// a third-party component that omits e.g. runtime.play must never be described as runnable merely
// because it carries an integrity-bound artifact declaration.
function describeWasmProjectPresentation(project: Extract<PokieProject, {type: "wasm"}>): ProjectPresentation {
    const canonical = project.capabilities.includes(WASM_CANONICAL_ARTIFACT_CAPABILITY);
    if (!canonical) return PROJECT_PRESENTATIONS.wasm;

    const canPlay = project.capabilities.includes(WASM_RUNTIME_PLAY_CAPABILITY);
    const canReplay = project.capabilities.includes(WASM_RUNTIME_REPLAY_CAPABILITY);
    const nextActions: ProjectNextAction[] = [{label: "Validate the component", command: "pokie validate <path>"}];
    if (canPlay) {
        nextActions.push(
            {label: "Start one deterministic round", command: "pokie run <path> --seed demo"},
            {label: "Simulate component rounds", command: "pokie sim <path> --rounds 10000 --seed demo"},
        );
    }
    if (canReplay) {
        nextActions.push({label: "Replay one component round", command: "pokie replay <path> --round 1 --seed demo"});
    }

    return {
        ...PROJECT_PRESENTATIONS.wasm,
        purpose: canPlay
            ? "A portable, self-describing POKIE game artifact. Its declared portable operations are integrity checked before POKIE uses them."
            : "A self-describing POKIE WASM artifact with no declared portable play operation. Its metadata can be validated, but POKIE cannot start a round.",
        nextActions,
        prerequisites: canPlay
            ? []
            : ["This canonical component does not declare runtime.play. Rebuild it with the portable operation declarations required for play."],
    };
}
