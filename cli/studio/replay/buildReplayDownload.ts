import type {ReplayDescriptor} from "pokie";

export type StudioReplayDownload = {
    contentType: string;
    filename: string;
    body: string;
};

// The one-and-only download format for a replay (unlike a simulation report's json/markdown/html
// choice) — a ReplayDescriptor is already just data, pretty-printed exactly as `pokie replay --out`
// writes it. Filename sanitization mirrors buildSimulationReportDownload.ts's own approach.
export function buildReplayDownload(descriptor: ReplayDescriptor, replayId: string): StudioReplayDownload {
    return {
        contentType: "application/json; charset=utf-8",
        filename: buildReplayFilename(descriptor.game.id, descriptor.game.version, replayId),
        body: JSON.stringify(descriptor, null, 4),
    };
}

function buildReplayFilename(gameId: string, gameVersion: string, replayId: string): string {
    const sanitize = (value: string): string => value.replace(/[^a-zA-Z0-9._-]+/g, "-");
    return `${sanitize(gameId)}-${sanitize(gameVersion)}-${sanitize(replayId)}.json`;
}
