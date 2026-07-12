import type {StudioReplayListEntry} from "./StudioReplayListEntry.js";
import type {StudioReplayRecord} from "./StudioReplayRecord.js";
import type {StudioReplayRecordView} from "./StudioReplayRecordView.js";

export function toStudioReplayRecordView(record: StudioReplayRecord): StudioReplayRecordView {
    return {id: record.id, projectRoot: record.projectRoot, descriptor: record.descriptor};
}

export function toStudioReplayListEntry(record: StudioReplayRecord): StudioReplayListEntry {
    const {descriptor} = record;
    return {
        id: record.id,
        game: descriptor.game,
        round: descriptor.round,
        seed: descriptor.seed,
        totalBet: descriptor.totalBet,
        totalWin: descriptor.totalWin,
        timestamp: descriptor.timestamp,
        durationMs: descriptor.durationMs,
    };
}
