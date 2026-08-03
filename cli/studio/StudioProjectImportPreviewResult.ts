import type {ProjectCapabilities, ProjectType} from "pokie";

// The outcome of StudioProjectRegistrationService.previewImport — a read-only "detect" step Import
// Project runs before ever calling registerExternal, so a user can see what a path resolves to (and
// decide whether to proceed) without it being committed to the registry yet. "unrecognized" is an
// ordinary, expected outcome (same reasoning as StudioProjectRegistrationResult's own "unrecognized"),
// not a failure a caller needs to treat as exceptional.
export type StudioProjectImportPreviewResult =
    | {
          readonly status: "recognized";
          readonly location: string;
          readonly type: ProjectType;
          readonly capabilities: ProjectCapabilities;
          readonly suggestedName: string;
      }
    | {readonly status: "unrecognized"; readonly path: string};
