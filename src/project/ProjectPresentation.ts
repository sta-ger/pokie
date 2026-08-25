import type {PokieProject} from "./PokieProject.js";
import type {ProjectType} from "./ProjectType.js";

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
            {label: "Inspect exact outcome statistics", command: "pokie outcomesource inspect <path>"},
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
            {label: "Inspect exact outcome statistics", command: "pokie outcomesource inspect <path>"},
            {label: "Compare it with another outcome source", command: "pokie outcomesource diff <path> <otherPath>"},
        ],
        prerequisites: [
            "To sample, simulate, replay, or serve outcomes, use the compatible Outcome Library that produced this export.",
            "To run or validate game logic, use a POKIE game package.",
        ],
    },
    wasm: {
        kind: "POKIE WASM component",
        purpose: "A compatible WebAssembly component whose POKIE metadata can be inspected.",
        nextActions: [{label: "Inspect this component", command: "pokie inspect <path>"}],
        prerequisites: [
            "POKIE can inspect this component's metadata, but cannot build, run, simulate, or validate WASM game logic.",
        ],
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
    return PROJECT_PRESENTATIONS[project.type];
}
