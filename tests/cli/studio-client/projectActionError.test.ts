import {classifyProjectActionErrorReason, describeProjectActionError} from "../../../cli/studio-client/src/domain/projectActionError.js";

describe("project action error copy", () => {
    it("turns a rejected adaptive simulation request into a settings hint", () => {
        const raw = '"convergence" requires minRounds, rtpTolerance and checkIntervalRounds.';
        expect(classifyProjectActionErrorReason(raw)).toBe("settings");
        expect(describeProjectActionError("This simulation request", raw)).toContain("a setting is invalid");
        expect(describeProjectActionError("This simulation request", raw)).toContain("spin budget");
        expect(describeProjectActionError("This simulation request", raw)).not.toContain("convergence");
    });

    it("keeps network and schema failures distinct", () => {
        expect(classifyProjectActionErrorReason("Failed to fetch")).toBe("network");
        expect(classifyProjectActionErrorReason("rounds must be a positive integer")).toBe("schema");
        expect(classifyProjectActionErrorReason("Unexpected server failure")).toBe("other");
    });
});
