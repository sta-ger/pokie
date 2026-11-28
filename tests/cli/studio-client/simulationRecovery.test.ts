import type {StudioJobView} from "../../../cli/studio-client/src/api/types.js";
import {isSupersededSimulationRecovery, latestCompletedSimulationAt} from "../../../cli/studio-client/src/domain/interpret/SimulationRecovery.js";

function job(overrides: Partial<StudioJobView>): StudioJobView {
    return {
        id: "job",
        projectId: "project",
        operation: "simulation",
        request: {},
        conflictKey: "simulation:project",
        status: "recovery-required",
        createdAt: 10,
        ...overrides,
    } as StudioJobView;
}

describe("simulation recovery precedence", () => {
    it("keeps a restart-interrupted run visible until a newer completed simulation exists", () => {
        const recovery = job({id: "recovery", createdAt: 10});
        expect(latestCompletedSimulationAt([recovery])).toBe(0);
        expect(isSupersededSimulationRecovery(recovery, 0)).toBe(false);
        expect(isSupersededSimulationRecovery(recovery, 20)).toBe(true);
    });

    it("only treats a newer completed simulation as the successor", () => {
        const completed = job({id: "completed", status: "completed", createdAt: 20});
        const recovery = job({id: "recovery", createdAt: 10});
        expect(latestCompletedSimulationAt([recovery, completed])).toBe(20);
        expect(isSupersededSimulationRecovery(recovery, 20)).toBe(true);
        expect(isSupersededSimulationRecovery(job({createdAt: 20}), 20)).toBe(false);
    });

    it("does not affect recovery records from other operations", () => {
        const replay = job({operation: "replay", createdAt: 10});
        expect(isSupersededSimulationRecovery(replay, 20)).toBe(false);
    });
});
