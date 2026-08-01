import type {ProjectCapabilities} from "./ProjectCapabilities.js";

// Fields every resolved PokieProject carries regardless of type. "capabilities" is always exactly
// PROJECT_TYPE_CAPABILITIES[type] (see ProjectCapabilities.ts) at the moment this project was resolved —
// carried on the instance, not left for a downstream consumer to look up a second time from "type" alone, so
// a caller that only has a PokieProject in hand (no resolver, no ProjectType import) can still answer "does
// this support operation X" via describeUnsupportedProjectOperation without an extra lookup step.
type PokieProjectBase = {
    // Absolute path to the file (blueprint, parWorkbook, wasm) or directory (tsPackage, outcomeLibrary,
    // stakeAdapter) this project was resolved from — see ProjectResolving.
    readonly rootPath: string;
    readonly capabilities: ProjectCapabilities;
};

export type BlueprintProject = PokieProjectBase & {readonly type: "blueprint"};
export type TsPackageProject = PokieProjectBase & {readonly type: "tsPackage"};
export type OutcomeLibraryProject = PokieProjectBase & {readonly type: "outcomeLibrary"};
export type StakeAdapterProject = PokieProjectBase & {readonly type: "stakeAdapter"};
export type WasmProject = PokieProjectBase & {readonly type: "wasm"};
export type ParWorkbookProject = PokieProjectBase & {readonly type: "parWorkbook"};

// A single, resolved project fact — what ProjectResolving.resolve() returns, and the one shape every
// downstream consumer (a command, a Studio service) should switch on instead of re-sniffing a path's own
// extension/directory contents for itself. Discriminated on "type" (see ProjectType.ts) so a switch over it
// is exhaustive at compile time.
export type PokieProject =
    | BlueprintProject
    | TsPackageProject
    | OutcomeLibraryProject
    | StakeAdapterProject
    | WasmProject
    | ParWorkbookProject;
