import type {StudioReplayRecord} from "./StudioReplayRecord.js";

export interface StudioReplayRepository {
    // Also where retention is enforced — see InMemoryStudioReplayRepository's own doc comment.
    save(record: StudioReplayRecord): void;

    get(id: string): StudioReplayRecord | undefined;

    // Every replay recorded for one project, most-recently-recorded first. Never includes another
    // project's replays — the basis for both GET /api/project/replays and project-isolation checks.
    listByProjectRoot(projectRoot: string): StudioReplayRecord[];
}
