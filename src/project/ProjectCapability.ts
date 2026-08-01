// A capability id is a plain, open string rather than a closed union — same convention as
// ExternalDeploymentCapability (see externaladapter/ExternalDeploymentCapability.ts) and for the identical
// reason: the constants below are the vocabulary POKIE's own ProjectCapabilities/PokieOperation model
// understands today, but closing this to a union would make every future capability a breaking change to this
// file rather than an additive one.
export type ProjectCapability = string;

// A project that can be loaded and executed in-process as a PokieGame — the capability "sim", "replay",
// "serve", "dev", "client", "studio", "inspect", "validate", and "outcomeLibrary.generate" all require. Only
// a "tsPackage" project grants it today.
export const RUNTIME_EXECUTE_CAPABILITY: ProjectCapability = "runtime.execute";

// A project that can be built into a generated tsPackage — what "build" requires. Only a "blueprint" project
// grants it today.
export const BLUEPRINT_BUILD_CAPABILITY: ProjectCapability = "blueprint.build";

// A project that already holds a readable outcome-library bundle — what "outcomeLibrary.build" and
// "outcomeLibrary.validate" require. Only an "outcomeLibrary" project grants it today.
export const OUTCOME_LIBRARY_READ_CAPABILITY: ProjectCapability = "outcomeLibrary.read";

// A project that can be exchanged with Stake Engine — what "stakeEngine.export", "stakeEngine.import",
// "stakeEngine.analyze", and "stakeEngine.diff" require. Only a "stakeAdapter" project grants it today.
export const STAKE_ADAPTER_EXCHANGE_CAPABILITY: ProjectCapability = "stakeAdapter.exchange";

// A project that can be exchanged as a PAR sheet workbook — what "par.import" and "par.export" require. Only
// a "parWorkbook" project grants it today.
export const PAR_WORKBOOK_EXCHANGE_CAPABILITY: ProjectCapability = "parWorkbook.exchange";

// What "wasm.export" would require. Declared here so a future step can grant it to a project type without
// inventing a new capability id at the same time — no ProjectType grants it yet (see ProjectType.ts's own
// "wasm" doc comment), so describeUnsupportedProjectOperation reports every "wasm.export" attempt as
// unsupported with no alternatives, today.
export const WASM_EXPORT_CAPABILITY: ProjectCapability = "wasm.export";
