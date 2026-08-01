import {classifyRuntimeActionErrorReason, describeRuntimeActionError} from "../../../../../cli/studio-client/src/domain/runtimeActionError";

describe("classifyRuntimeActionErrorReason", () => {
    it("classifies a raw fetch/network failure message as network", () => {
        expect(classifyRuntimeActionErrorReason("Failed to fetch")).toBe("network");
        expect(classifyRuntimeActionErrorReason("NetworkError when attempting to fetch resource.")).toBe("network");
        expect(classifyRuntimeActionErrorReason("connect ECONNREFUSED 127.0.0.1:4123")).toBe("network");
    });

    it("classifies a raw EADDRINUSE message as port-in-use", () => {
        expect(classifyRuntimeActionErrorReason("EADDRINUSE: address already in use 127.0.0.1:4123")).toBe("port-in-use");
        expect(classifyRuntimeActionErrorReason("Error: address already in use")).toBe("port-in-use");
    });

    it("classifies a schema/required-field rejection or malformed-JSON message as schema", () => {
        expect(classifyRuntimeActionErrorReason('"seed" is required.')).toBe("schema");
        expect(classifyRuntimeActionErrorReason('"requestId" must be a non-empty string.')).toBe("schema");
        expect(classifyRuntimeActionErrorReason("is not valid JSON: Unexpected token o in JSON at position 1")).toBe("schema");
    });

    it("falls back to other for an unrecognized message", () => {
        expect(classifyRuntimeActionErrorReason("Insufficient balance for this session.")).toBe("other");
        expect(classifyRuntimeActionErrorReason("boom")).toBe("other");
    });
});

describe("describeRuntimeActionError", () => {
    it("never echoes the raw message back for a classified reason", () => {
        const rawMessage = "EADDRINUSE: address already in use 127.0.0.1:4123";
        const described = describeRuntimeActionError("The runtime server", rawMessage);

        expect(described).not.toContain(rawMessage);
        expect(described).toBe(
            "The runtime server couldn't start -- the configured host/port is already in use. Choose a different port, or stop whatever else is using it, then try again.",
        );
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
        expect(described).toBe("This request couldn't be completed. Try again, and check the Studio server logs if the problem persists.");
    });
});
