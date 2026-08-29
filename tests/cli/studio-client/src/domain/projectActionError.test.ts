import {classifyProjectActionErrorReason, describeProjectActionError} from "../../../../../cli/studio-client/src/domain/projectActionError";

describe("classifyProjectActionErrorReason", () => {
    it("classifies a raw fetch/network failure message as network", () => {
        expect(classifyProjectActionErrorReason("Failed to fetch")).toBe("network");
        expect(classifyProjectActionErrorReason("NetworkError when attempting to fetch resource.")).toBe("network");
        expect(classifyProjectActionErrorReason("connect ECONNREFUSED 127.0.0.1:4123")).toBe("network");
    });

    it("classifies a schema/required-field rejection or malformed-JSON message as schema", () => {
        expect(classifyProjectActionErrorReason('"rounds" is required.')).toBe("schema");
        expect(classifyProjectActionErrorReason('"seed" must be a non-empty string.')).toBe("schema");
        expect(classifyProjectActionErrorReason("is not valid JSON: Unexpected token o in JSON at position 1")).toBe("schema");
    });

    it("falls back to other for an unrecognized message", () => {
        expect(classifyProjectActionErrorReason("Internal error")).toBe("other");
        expect(classifyProjectActionErrorReason("ENOENT: no such file or directory")).toBe("other");
        expect(classifyProjectActionErrorReason("boom")).toBe("other");
    });
});

describe("describeProjectActionError", () => {
    it("never echoes the raw message back for a classified reason", () => {
        const rawMessage = "Failed to fetch";
        const described = describeProjectActionError("This simulation request", rawMessage);

        expect(described).not.toContain(rawMessage);
        expect(described).toBe("This simulation request couldn't reach the Studio server. Check your connection and try again.");
    });

    it("gives subject-specific, actionable copy for each reason", () => {
        expect(describeProjectActionError("The project inspection", "Failed to fetch")).toBe(
            "The project inspection couldn't reach the Studio server. Check your connection and try again.",
        );
        expect(describeProjectActionError("This validation request", '"rounds" is required.')).toBe(
            "This validation request was rejected as invalid. Check the values entered and try again.",
        );
    });

    it("still avoids echoing an unrecognized raw message verbatim", () => {
        const rawMessage = "Internal error";
        const described = describeProjectActionError("This validation request", rawMessage);

        expect(described).not.toContain(rawMessage);
        expect(described).toBe("This validation request couldn't be completed. Try again. If it continues, reopen the project and retry.");
    });

    it("preserves the safe planner runtime diagnostic and its recovery", () => {
        const diagnostic = "Cannot prepare a runnable runtime from \\\"/games/slot.par.xlsx\\\". Attempted path: parWorkbook -> tsPackage; planned/reusable stages: import blueprint; failed conversion edge: blueprint -> tsPackage. Fix the workbook and retry.";

        expect(describeProjectActionError("This simulation request", diagnostic)).toBe(diagnostic);
    });
});
