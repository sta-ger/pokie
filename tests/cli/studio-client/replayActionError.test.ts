import {classifyReplayActionErrorReason, describeReplayActionError} from "../../../cli/studio-client/src/domain/replayActionError.js";

describe("describeReplayActionError", () => {
    it("explains a recorded round from a different game configuration", () => {
        const raw = "audit-identity: identity.modelHash: Recorded value differs from selected authority or reproduced execution.";

        expect(classifyReplayActionErrorReason(raw)).toBe("configuration");
        expect(describeReplayActionError("The pasted record", raw)).toBe(
            "The pasted record was recorded with a different game configuration. Open the design/version that produced this round, or record a new round against the current design.",
        );
    });

    it("keeps expired ids and network failures classified as before", () => {
        expect(classifyReplayActionErrorReason('Unknown replay id "gone".')).toBe("not-found");
        expect(classifyReplayActionErrorReason("Failed to fetch")).toBe("network");
    });
});
