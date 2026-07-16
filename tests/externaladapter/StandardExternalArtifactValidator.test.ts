import {ExternalArtifactGenerationResult, ExternalGeneratedArtifact, StandardExternalArtifactValidator} from "pokie";

function resultOf(artifacts: readonly ExternalGeneratedArtifact[]): ExternalArtifactGenerationResult {
    return {artifacts, issues: []};
}

function issueCodes(validator: StandardExternalArtifactValidator, result: ExternalArtifactGenerationResult): string[] {
    return validator.validate(result).map((issue) => issue.code);
}

describe("StandardExternalArtifactValidator", () => {
    const validator = new StandardExternalArtifactValidator();

    it("reports no issues for a valid artifact set", () => {
        const result = resultOf([
            {relativePath: "base/0.json", content: `{"a":1}`},
            {relativePath: "index.json", content: `{"modes":[]}`},
        ]);
        expect(validator.validate(result)).toEqual([]);
    });

    it("accepts non-JSON files without parsing them", () => {
        const result = resultOf([{relativePath: "books.jsonl", content: "not json at all"}]);
        expect(validator.validate(result)).toEqual([]);
    });

    it("reports external-artifact-path-unsafe for an absolute path", () => {
        expect(issueCodes(validator, resultOf([{relativePath: "/etc/passwd", content: "x"}]))).toEqual(["external-artifact-path-unsafe"]);
    });

    it("reports external-artifact-path-unsafe for a path escaping the root via ..", () => {
        expect(issueCodes(validator, resultOf([{relativePath: "../outside.json", content: "{}"}]))).toEqual(["external-artifact-path-unsafe"]);
    });

    it("reports external-artifact-path-unsafe for an empty path", () => {
        expect(issueCodes(validator, resultOf([{relativePath: "", content: "x"}]))).toEqual(["external-artifact-path-unsafe"]);
    });

    it("reports external-artifact-duplicate-path for two artifacts with the exact same path", () => {
        const result = resultOf([
            {relativePath: "a.json", content: "{}"},
            {relativePath: "a.json", content: "{}"},
        ]);
        expect(issueCodes(validator, result)).toEqual(["external-artifact-duplicate-path"]);
    });

    it("reports external-artifact-path-case-collision for two paths differing only in case", () => {
        const result = resultOf([
            {relativePath: "Base/0.json", content: "{}"},
            {relativePath: "base/0.json", content: "{}"},
        ]);
        expect(issueCodes(validator, result)).toEqual(["external-artifact-path-case-collision"]);
    });

    it("reports external-artifact-content-empty for empty string content", () => {
        expect(issueCodes(validator, resultOf([{relativePath: "empty.txt", content: ""}]))).toEqual(["external-artifact-content-empty"]);
    });

    it("reports external-artifact-content-empty for an empty Buffer", () => {
        expect(issueCodes(validator, resultOf([{relativePath: "empty.bin", content: Buffer.alloc(0)}]))).toEqual(["external-artifact-content-empty"]);
    });

    it("reports external-artifact-json-invalid for a .json file that doesn't parse", () => {
        expect(issueCodes(validator, resultOf([{relativePath: "broken.json", content: "{not json"}]))).toEqual(["external-artifact-json-invalid"]);
    });

    it("accepts JSON content passed as a Buffer", () => {
        expect(issueCodes(validator, resultOf([{relativePath: "ok.json", content: Buffer.from(`{"a":1}`)}]))).toEqual([]);
    });

    describe("hardening against a malformed generation result", () => {
        it("never throws, and reports a structural issue, when the result itself is not an object", () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect(() => validator.validate(null as any)).not.toThrow();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            expect(issueCodes(validator, null as any)).toEqual(["external-artifact-generation-result-invalid"]);
        });

        it("reports external-artifact-generation-result-invalid when artifacts is not an array", () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = {artifacts: "not-an-array", issues: []} as any;
            expect(() => validator.validate(result)).not.toThrow();
            expect(issueCodes(validator, result)).toEqual(["external-artifact-generation-result-invalid"]);
        });

        it("reports external-artifact-generation-result-invalid when issues is not an array", () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = {artifacts: [], issues: null} as any;
            expect(issueCodes(validator, result)).toEqual(["external-artifact-generation-result-invalid"]);
        });

        it("reports both artifacts- and issues-shape issues together when both are wrong", () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = {artifacts: {}, issues: {}} as any;
            expect(issueCodes(validator, result)).toEqual(["external-artifact-generation-result-invalid", "external-artifact-generation-result-invalid"]);
        });

        it("reports external-artifact-shape-invalid when an artifact entry is not an object", () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = {artifacts: ["not-an-object"], issues: []} as any;
            expect(issueCodes(validator, result)).toEqual(["external-artifact-shape-invalid"]);
        });

        it("reports external-artifact-shape-invalid for a null artifact entry without throwing", () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = {artifacts: [null], issues: []} as any;
            expect(() => validator.validate(result)).not.toThrow();
            expect(issueCodes(validator, result)).toEqual(["external-artifact-shape-invalid"]);
        });

        it("reports external-artifact-relative-path-invalid when relativePath is not a string", () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = {artifacts: [{relativePath: 42, content: "{}"}], issues: []} as any;
            expect(issueCodes(validator, result)).toEqual(["external-artifact-relative-path-invalid"]);
        });

        it("reports external-artifact-relative-path-invalid when relativePath is missing entirely", () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = {artifacts: [{content: "{}"}], issues: []} as any;
            expect(issueCodes(validator, result)).toEqual(["external-artifact-relative-path-invalid"]);
        });

        it("reports external-artifact-content-type-invalid when content is a number, without touching path-based checks", () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = {artifacts: [{relativePath: "a.json", content: 12345}], issues: []} as any;
            expect(() => validator.validate(result)).not.toThrow();
            expect(issueCodes(validator, result)).toEqual(["external-artifact-content-type-invalid"]);
        });

        it("reports external-artifact-content-type-invalid when content is an object", () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = {artifacts: [{relativePath: "a.json", content: {}}], issues: []} as any;
            expect(issueCodes(validator, result)).toEqual(["external-artifact-content-type-invalid"]);
        });

        it("reports external-artifact-content-type-invalid when content is undefined", () => {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const result = {artifacts: [{relativePath: "a.json"}], issues: []} as any;
            expect(() => validator.validate(result)).not.toThrow();
            expect(issueCodes(validator, result)).toEqual(["external-artifact-content-type-invalid"]);
        });

        it("still catches unsafe/duplicate path problems among the entries that are shaped correctly", () => {
            const result = {
                artifacts: [
                    {relativePath: "../escape.json", content: "{}"},
                    {relativePath: "ok.json", content: 999},
                    "not-an-object",
                ],
                issues: [],
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
            } as any;
            const codes = issueCodes(validator, result);
            expect(codes).toContain("external-artifact-path-unsafe");
            expect(codes).toContain("external-artifact-content-type-invalid");
            expect(codes).toContain("external-artifact-shape-invalid");
            expect(codes).toHaveLength(3);
        });
    });
});
