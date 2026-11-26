import {describeReplayComparison} from "../../../cli/studio-client/src/domain/interpret/Replay.js";
import type {ReplayDescriptor} from "../../../cli/studio-client/src/api/types.js";

function recording(status: "recorded" | "verified", state?: {before?: unknown; after?: unknown}): ReplayDescriptor {
    return {
        audit: {hash: "sha256:audit"} as never,
        auditStatus: status,
        auditCompletion: "completed",
        sessionId: "session-1",
        game: {id: "game", name: "Game", version: "1.0.0"},
        seed: null,
        round: 1,
        totalBet: 1,
        totalWin: 0,
        screen: [],
        timestamp: 0,
        durationMs: 0,
        ...(state?.before === undefined ? {} : {stateBefore: state.before as Record<string, unknown>}),
        ...(state?.after === undefined ? {} : {stateAfter: state.after as Record<string, unknown>}),
    };
}

describe("describeReplayComparison audit-backed records", () => {
    it("does not call a partial record a full match when session state was never captured", () => {
        const comparison = describeReplayComparison(
            {recording: recording("recorded")},
            {recording: recording("verified")},
        );

        expect(comparison.status).toBe("partial");
        expect(comparison.auditVerified).toBe(true);
        expect(comparison.dimensions.state.status).toBe("unavailable");
    });

    it("reports a full match when the audit and both session states agree", () => {
        const comparison = describeReplayComparison(
            {recording: recording("recorded"), stateBefore: {bet: 1}, stateAfter: {bet: 1, credits: 1000}},
            {recording: recording("verified"), stateBefore: {bet: 1}, stateAfter: {bet: 1, credits: 1000}},
        );

        expect(comparison.status).toBe("match");
        expect(comparison.dimensions.state.status).toBe("match");
    });

    it("keeps a real state difference visible instead of letting the audit hide it", () => {
        const comparison = describeReplayComparison(
            {recording: recording("recorded"), stateBefore: {bet: 1}, stateAfter: {bet: 1, credits: 1000}},
            {recording: recording("verified"), stateBefore: {bet: 1}, stateAfter: {bet: 1, credits: 999}},
        );

        expect(comparison.status).toBe("mismatch");
        expect(comparison.dimensions.state.status).toBe("mismatch");
    });

    it("still reports an unverified audit as unavailable rather than a match", () => {
        const comparison = describeReplayComparison(
            {recording: recording("recorded"), stateBefore: {bet: 1}, stateAfter: {bet: 1}},
            {recording: recording("recorded"), stateBefore: {bet: 1}, stateAfter: {bet: 1}},
        );

        expect(comparison.status).toBe("unavailable");
    });
});
