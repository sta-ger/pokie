import {
    describeParSheetExportOutcome,
    describeParSheetExportResult,
    describeParSheetImportOutcome,
    describeParSheetImportResult,
    describeParSheetProvenanceSummary,
    isStaleParSheetExportRequest,
    isUnsupportedParSheetExport,
} from "../../../../../../cli/studio-client/src/domain/interpret/ParSheetImportExport";
import type {StudioParSheetExportView, StudioParSheetImportView, ValidationIssue} from "../../../../../../cli/studio-client/src/api/types";

describe("interpretParSheetImportExport", () => {
    describe("describeParSheetImportResult", () => {
        it("passes through an ok result with its blueprint/provenance/errors/warnings", () => {
            const view: StudioParSheetImportView = {
                status: "ok",
                path: "/a/in.par.xlsx",
                blueprint: {manifest: {id: "a"}},
                provenance: {pokieVersion: "1.2.0"},
                errors: [],
                warnings: [],
            };
            expect(describeParSheetImportResult(view)).toEqual(view);
        });

        it("passes through a load-error", () => {
            expect(describeParSheetImportResult({status: "load-error", error: "not found"})).toEqual({status: "load-error", error: "not found"});
        });
    });

    describe("describeParSheetExportResult", () => {
        it("passes through an ok result", () => {
            const view: StudioParSheetExportView = {status: "ok", path: "/a/out.par.xlsx", warnings: []};
            expect(describeParSheetExportResult(view)).toEqual(view);
        });

        it("passes through a conflict", () => {
            const view: StudioParSheetExportView = {status: "conflict", path: "/a/out.par.xlsx", error: "already exists"};
            expect(describeParSheetExportResult(view)).toEqual(view);
        });

        it("renames a server-side error to 'failed', so it never collides with the local network-error wrapper's own 'error' status", () => {
            const view: StudioParSheetExportView = {status: "error", error: "disk full"};
            expect(describeParSheetExportResult(view)).toEqual({status: "failed", message: "disk full"});
        });
    });

    describe("isStaleParSheetExportRequest", () => {
        it("is not stale when the revision is unchanged", () => {
            expect(isStaleParSheetExportRequest(3, 3)).toBe(false);
        });

        it("is stale once the revision has moved on, in either direction", () => {
            expect(isStaleParSheetExportRequest(3, 4)).toBe(true);
            expect(isStaleParSheetExportRequest(4, 0)).toBe(true);
        });
    });

    describe("describeParSheetImportOutcome", () => {
        it("is success with no errors or warnings", () => {
            expect(describeParSheetImportOutcome({errors: [], warnings: []})).toBe("success");
        });

        it("is partial when there are only warnings", () => {
            const warning: ValidationIssue = {code: "parsheet-provenance-missing", severity: "warning", message: "no Meta sheet"};
            expect(describeParSheetImportOutcome({errors: [], warnings: [warning]})).toBe("partial");
        });

        it("is invalid when there is at least one error, regardless of warnings", () => {
            const error: ValidationIssue = {code: "parsheet-missing-sheet", severity: "error", message: "missing Paytable"};
            const warning: ValidationIssue = {code: "parsheet-provenance-missing", severity: "warning", message: "no Meta sheet"};
            expect(describeParSheetImportOutcome({errors: [error], warnings: [warning]})).toBe("invalid");
        });
    });

    describe("isUnsupportedParSheetExport", () => {
        it("is true for parsheet-unsupported-reel-source", () => {
            const issues: ValidationIssue[] = [{code: "parsheet-unsupported-reel-source", severity: "error", message: "x"}];
            expect(isUnsupportedParSheetExport(issues)).toBe(true);
        });

        it("is true for parsheet-missing-reel-strips", () => {
            const issues: ValidationIssue[] = [{code: "parsheet-missing-reel-strips", severity: "error", message: "x"}];
            expect(isUnsupportedParSheetExport(issues)).toBe(true);
        });

        it("is false for an unrelated error code", () => {
            const issues: ValidationIssue[] = [{code: "blueprint-paytable-empty", severity: "error", message: "x"}];
            expect(isUnsupportedParSheetExport(issues)).toBe(false);
        });

        it("is false for no errors", () => {
            expect(isUnsupportedParSheetExport([])).toBe(false);
        });
    });

    describe("describeParSheetExportOutcome", () => {
        it("is success for ok with no warnings", () => {
            expect(describeParSheetExportOutcome({status: "ok", path: "/a/out.par.xlsx", warnings: []})).toBe("success");
        });

        it("is partial for ok with warnings", () => {
            const warning: ValidationIssue = {code: "blueprint-weighting-dominant-symbol", severity: "warning", message: "x"};
            expect(describeParSheetExportOutcome({status: "ok", path: "/a/out.par.xlsx", warnings: [warning]})).toBe("partial");
        });

        it("is unsupported for invalid with a recognized unsupported-reel-source error", () => {
            const error: ValidationIssue = {code: "parsheet-unsupported-reel-source", severity: "error", message: "x"};
            expect(describeParSheetExportOutcome({status: "invalid", errors: [error], warnings: []})).toBe("unsupported");
        });

        it("is invalid for invalid with an unrelated error", () => {
            const error: ValidationIssue = {code: "blueprint-reels-invalid", severity: "error", message: "x"};
            expect(describeParSheetExportOutcome({status: "invalid", errors: [error], warnings: []})).toBe("invalid");
        });

        it("is undefined for conflict/error (each has its own dedicated UI state)", () => {
            expect(describeParSheetExportOutcome({status: "conflict", path: "/a/out.par.xlsx", error: "already exists"})).toBeUndefined();
            expect(describeParSheetExportOutcome({status: "error", error: "disk full"})).toBeUndefined();
        });
    });

    describe("describeParSheetProvenanceSummary", () => {
        it("reports no recorded origin when provenance is undefined", () => {
            expect(describeParSheetProvenanceSummary(undefined)).toBe('This file has no recorded origin (no "Meta" sheet).');
        });

        it("summarizes pokieVersion/exportedAt/source when present", () => {
            expect(describeParSheetProvenanceSummary({pokieVersion: "1.2.0", exportedAt: "2026-01-01", source: "blueprint.json"})).toBe(
                'Exported by pokie v1.2.0 on 2026-01-01 from "blueprint.json".',
            );
        });

        it("summarizes with only the fields actually present", () => {
            expect(describeParSheetProvenanceSummary({pokieVersion: "1.2.0"})).toBe("Exported by pokie v1.2.0.");
        });

        it("reports no usable origin details when provenance is present but empty", () => {
            expect(describeParSheetProvenanceSummary({})).toBe('This file has a "Meta" sheet, but it records no usable origin details.');
        });
    });
});
