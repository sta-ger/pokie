// The one place both Studio's HTTP router and the browser client's own build-job URLs are judged
// against each other. `POST /api/project/build/build` creates a queued job; the same
// `/api/project/build/build/<id>` prefix then serves its status, activation, cancellation and
// completed single-file download. The
// older `/api/project/artifacts/build/<id>` spelling is retained as a read-through alias so a bookmarked
// or already-running pre-2.0 client can still finish its job.
export type ArtifactBuildJobRoute = {
    readonly id: string;
    readonly action?: "activate" | "cancel" | "download";
};

export function matchArtifactBuildJobRoute(pathname: string): ArtifactBuildJobRoute | undefined {
    const match = (/^\/api\/project\/(?:build\/build|artifacts\/build)\/([^/]+)(?:\/(cancel|activate|download))?$/).exec(pathname);
    if (match === null) {
        return undefined;
    }
    return {
        id: match[1]!,
        ...(match[2] === undefined ? {} : {action: match[2] as "activate" | "cancel" | "download"}),
    };
}
