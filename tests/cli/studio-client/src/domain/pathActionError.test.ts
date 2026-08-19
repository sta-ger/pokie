import {classifyPathActionErrorReason, describePathActionError} from "../../../../../cli/studio-client/src/domain/pathActionError";

describe("classifyPathActionErrorReason", () => {
    it("classifies a browser network failure as network", () => {
        expect(classifyPathActionErrorReason("Failed to fetch")).toBe("network");
        expect(classifyPathActionErrorReason("connect ECONNREFUSED 127.0.0.1:3200")).toBe("network");
    });

    it("classifies a raw ENOENT message as absent", () => {
        expect(classifyPathActionErrorReason("ENOENT: no such file or directory, open '/foo/bar.json'")).toBe("absent");
        expect(classifyPathActionErrorReason('"/foo/bar.json" does not exist.')).toBe("absent");
    });

    it("classifies a raw EACCES/EPERM message as permission", () => {
        expect(classifyPathActionErrorReason("EACCES: permission denied, open '/foo/bar.json'")).toBe("permission");
        expect(classifyPathActionErrorReason('Permission denied reading "/foo/bar".')).toBe("permission");
    });

    it("classifies a file-vs-directory mismatch message as type", () => {
        expect(classifyPathActionErrorReason('"/foo" is a directory, not a file.')).toBe("type");
        expect(classifyPathActionErrorReason('"/foo" is not a directory.')).toBe("type");
    });

    it("classifies a schema/required-field rejection or malformed-JSON message as schema", () => {
        expect(classifyPathActionErrorReason('"path" is required.')).toBe("schema");
        expect(classifyPathActionErrorReason('"bundleDir" must be a non-empty string.')).toBe("schema");
        expect(classifyPathActionErrorReason('"./x.json" is not valid JSON: Unexpected token o in JSON at position 1')).toBe("schema");
    });

    it("falls back to other for an unrecognized message", () => {
        expect(classifyPathActionErrorReason("bundle directory not found")).toBe("other");
        expect(classifyPathActionErrorReason("boom")).toBe("other");
    });
});

describe("describePathActionError", () => {
    it("never echoes the raw message back for a classified reason", () => {
        const rawMessage = "ENOENT: no such file or directory, open '/foo/bar.json'";
        const described = describePathActionError("The blueprint file", rawMessage);

        expect(described).not.toContain(rawMessage);
        expect(described).toBe("The blueprint file could not be found. Check the path and try again.");
    });

    it("gives subject-specific, actionable copy for each reason", () => {
        expect(describePathActionError("This validation request", "Failed to fetch")).toBe(
            "This validation request couldn't reach POKIE Studio. Start or restart Studio, then try again.",
        );
        expect(describePathActionError("The certification bundle directory", "EACCES: permission denied")).toBe(
            "The certification bundle directory isn't readable. Check its permissions and try again.",
        );
        expect(describePathActionError("The outcome library", '"/foo" is a directory, not a file.')).toBe(
            "The outcome library points to the wrong kind of item. Check whether it should be a file or a folder, and try again.",
        );
        expect(describePathActionError("The blueprint file", '"path" is required.')).toBe(
            "The blueprint file is missing or invalid. Provide a valid value and try again.",
        );
    });

    it("still avoids echoing an unrecognized raw message verbatim", () => {
        const rawMessage = "bundle directory not found";
        const described = describePathActionError("The certification bundle directory", rawMessage);

        expect(described).not.toContain(rawMessage);
        expect(described).toBe(
            "The certification bundle directory could not be completed. Try again. If it continues, choose the location again and retry.",
        );
    });
});
