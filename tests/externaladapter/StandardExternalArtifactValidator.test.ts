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
});
