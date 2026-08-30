import type {ProjectCapabilities, ProjectType, WasmProductContractView} from "pokie";

// The outcome of StudioProjectRegistrationService.previewImport — a read-only "detect" step Import
// Project runs before ever calling registerExternal, so a user can see what a path resolves to (and
// decide whether to proceed) without it being committed to the registry yet. "unrecognized" is an
// ordinary, expected outcome (same reasoning as StudioProjectRegistrationResult's own "unrecognized"),
// not a failure a caller needs to treat as exceptional.
type StudioRecognizedProjectImportPreview = {
    readonly status: "recognized";
    readonly location: string;
    readonly capabilities: ProjectCapabilities;
    readonly suggestedName: string;
};

export type StudioProjectImportPreviewResult =
    | (StudioRecognizedProjectImportPreview & {readonly type: Exclude<ProjectType, "wasm">})
    | (StudioRecognizedProjectImportPreview & {readonly type: "wasm"; readonly wasmPresentation: WasmProductContractView})
    | {readonly status: "unrecognized"; readonly path: string};
