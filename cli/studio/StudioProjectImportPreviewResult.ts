import type {ProjectCapabilities, ProjectType, WasmProductContractView} from "@fromstan/pokie";
import type {StudioProjectRegistryView} from "./StudioProjectRegistryView.js";

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
    /** Present when this exact location is already in Your projects; adding it again is never needed. */
    readonly existing?: StudioProjectRegistryView;
};

export type StudioProjectImportPreviewResult =
    | (StudioRecognizedProjectImportPreview & {readonly type: Exclude<ProjectType, "wasm">})
    // Canonical components are runnable and use the ordinary Open flow. The
    // presentation is retained only for legacy manifest-only compatibility.
    | (StudioRecognizedProjectImportPreview & {readonly type: "wasm"; readonly wasmPresentation?: WasmProductContractView})
    | {readonly status: "unrecognized"; readonly path: string};
