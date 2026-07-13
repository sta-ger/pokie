import type {StudioRuntimeStatus} from "./runtime/StudioRuntimeStatus.js";

// GET /api/studio/diagnostics' DTO — every field here is a primitive already safe to expose (no stack
// traces, env vars, tokens, or service instances): see StudioServer.buildDiagnostics()'s own doc
// comment for why each field is safe.
export type StudioDiagnosticsView = {
    studioVersion: string;
    nodeVersion: string;
    mode: "home" | "project";
    projectRoot?: string;
    activeSimulationCount: number;
    activeReplayCount: number;
    runtimeStatus: StudioRuntimeStatus;
    recentProjectStoragePath: string;
    uptimeSeconds: number;
};
