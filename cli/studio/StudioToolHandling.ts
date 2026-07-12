import type {StudioContext} from "./StudioContext.js";

// The seam future tool GUIs (create/init/build/inspect/validate/sim/report/diff/replay/serve) plug
// into, without StudioServer needing to know about any of them individually — see StudioServer's own
// doc comment for how `toolHandlers` is tried. No concrete implementation exists yet; this stage only
// establishes the extension point.
export interface StudioToolHandling {
    // A stable identifier this handler answers for, matched against the `:toolId` segment of
    // `/api/tools/:toolId/...` — e.g. "build", "sim".
    getToolId(): string;

    // Returning `undefined` means "not handled" (StudioServer falls through to its own routes);
    // returning a `{status, body}` short-circuits the response with that JSON body.
    handle(
        context: StudioContext,
        request: {method: string; url: URL; body: unknown},
    ): Promise<{status: number; body: unknown} | undefined>;
}
