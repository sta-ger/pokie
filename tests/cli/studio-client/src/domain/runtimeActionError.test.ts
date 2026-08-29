import {classifyRuntimeActionErrorReason, describeRuntimeActionError} from "../../../../../cli/studio-client/src/domain/runtimeActionError";

describe("classifyRuntimeActionErrorReason", () => {
    it("classifies a raw fetch/network failure message as network", () => {
        expect(classifyRuntimeActionErrorReason("Failed to fetch")).toBe("network");
        expect(classifyRuntimeActionErrorReason("NetworkError when attempting to fetch resource.")).toBe("network");
        expect(classifyRuntimeActionErrorReason("connect ECONNREFUSED 127.0.0.1:4123")).toBe("network");
    });

    it("classifies a schema/required-field rejection or malformed-JSON message as schema", () => {
        expect(classifyRuntimeActionErrorReason('"seed" is required.')).toBe("schema");
        expect(classifyRuntimeActionErrorReason('"requestId" must be a non-empty string.')).toBe("schema");
        expect(classifyRuntimeActionErrorReason("is not valid JSON: Unexpected token o in JSON at position 1")).toBe("schema");
    });

    it("classifies stable scenario capability and exhaustion diagnostics separately from retryable failures", () => {
        expect(classifyRuntimeActionErrorReason("This game doesn't support free games, so Find free games isn't available for it.")).toBe("unsupported");
        expect(classifyRuntimeActionErrorReason("No matching round was found within 2000 spins.")).toBe("scenario-not-found");
    });

    it("falls back to other for an unrecognized message", () => {
        expect(classifyRuntimeActionErrorReason("Insufficient balance for this session.")).toBe("other");
        expect(classifyRuntimeActionErrorReason("boom")).toBe("other");
    });
});

describe("describeRuntimeActionError", () => {
    it("never echoes the raw message back for a classified reason", () => {
        const rawMessage = '"seed" is required.';
        const described = describeRuntimeActionError("This request", rawMessage);

        expect(described).not.toContain(rawMessage);
        expect(described).toBe("This request was rejected as invalid. Check the values entered and try again.");
    });

    it("gives subject-specific, actionable copy for each reason", () => {
        expect(describeRuntimeActionError("The round history", "Failed to fetch")).toBe(
            "The round history couldn't reach the Studio server. Check your connection and try again.",
        );
        expect(describeRuntimeActionError("This request", '"seed" is required.')).toBe(
            "This request was rejected as invalid. Check the values entered and try again.",
        );
    });

    it("still avoids echoing an unrecognized raw message verbatim", () => {
        const rawMessage = "Insufficient balance for this session.";
        const described = describeRuntimeActionError("This request", rawMessage);

        expect(described).not.toContain(rawMessage);
        expect(described).toBe("This request couldn't be completed. Try again. If it continues, start a new session and retry.");
    });

    it("gives a scenario-specific modelling remedy for a configured feature that is unavailable or unreachable", () => {
        expect(describeRuntimeActionError("Find free games", "This game doesn't support free games, so Find free games isn't available for it.")).toBe(
            "Find free games isn't available for this game. Configure the required game feature, then start a new session.",
        );
        expect(describeRuntimeActionError("Find free games", "No matching round was found within 2000 spins.")).toBe(
            "Find free games didn't find a matching round. Check the game feature configuration, then start a new session.",
        );
    });

    it("preserves the safe planner runtime diagnostic and its recovery", () => {
        const diagnostic = "Cannot prepare a runnable runtime from \\\"/games/slot.par.xlsx\\\". Attempted path: parWorkbook -> tsPackage; planned/reusable stages: import blueprint; failed conversion edge: blueprint -> tsPackage. Fix the workbook and retry.";

        expect(describeRuntimeActionError("This session", diagnostic)).toBe(diagnostic);
    });
});
