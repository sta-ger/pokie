import {describeInspection, describeProjectHeader, describeValidationSummary} from "../../../../../../cli/studio-client/src/domain/interpret/ProjectDashboard";
import type {GamePackageInspectionReport, PokieGamePackageValidationReport} from "../../../../../../cli/studio-client/src/api/types";

describe("describeProjectHeader", () => {
    it("passes through the empty state", () => {
        expect(describeProjectHeader({status: "empty"})).toEqual({status: "empty"});
    });

    it("passes through the loading state with its projectRoot", () => {
        expect(describeProjectHeader({status: "loading", projectRoot: "/a"})).toEqual({
            status: "loading",
            projectRoot: "/a",
        });
    });

    it("passes through the error state with its message", () => {
        expect(describeProjectHeader({status: "error", projectRoot: "/a", error: "boom"})).toEqual({
            status: "error",
            projectRoot: "/a",
            message: "boom",
        });
    });

    it("flattens the loaded state's manifest fields", () => {
        const view = describeProjectHeader({
            status: "loaded",
            projectRoot: "/a",
            game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0", description: "A fruit slot"},
        });

        expect(view).toEqual({
            status: "loaded",
            projectRoot: "/a",
            id: "sample-slot",
            name: "Sample Slot",
            version: "0.1.0",
            description: "A fruit slot",
            capabilities: [],
        });
    });

    it("leaves description undefined when the manifest doesn't have one", () => {
        const view = describeProjectHeader({
            status: "loaded",
            projectRoot: "/a",
            game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
        });

        expect(view).toEqual({
            status: "loaded",
            projectRoot: "/a",
            id: "sample-slot",
            name: "Sample Slot",
            version: "0.1.0",
            description: undefined,
            capabilities: [],
        });
    });

    it("carries type/capabilities/origin through when the context provides them", () => {
        const view = describeProjectHeader({
            status: "loaded",
            projectRoot: "/a",
            game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
            type: "blueprint",
            capabilities: ["blueprint.build"],
            origin: "managed",
        });

        expect(view).toEqual({
            status: "loaded",
            projectRoot: "/a",
            id: "sample-slot",
            name: "Sample Slot",
            version: "0.1.0",
            description: undefined,
            type: "blueprint",
            capabilities: ["blueprint.build"],
            origin: "managed",
        });
    });
});

describe("describeInspection", () => {
    it("wraps a valid report with its package name/version/root", () => {
        const report: GamePackageInspectionReport = {
            packageRoot: "/a",
            valid: true,
            packageJson: {name: "a", version: "1.0.0"},
        };

        expect(describeInspection(report)).toEqual({
            status: "loaded",
            packageRoot: "/a",
            packageName: "a",
            packageVersion: "1.0.0",
        });
    });

    it("reports invalid (not loaded) for an invalid/unreadable package (missing or corrupt package.json)", () => {
        const report: GamePackageInspectionReport = {
            packageRoot: "/a",
            valid: false,
            error: '"/a/package.json" does not exist.',
        };

        expect(describeInspection(report)).toEqual({status: "invalid", message: '"/a/package.json" does not exist.'});
    });

    it("falls back to a generic message when an invalid report has no error text", () => {
        const report: GamePackageInspectionReport = {packageRoot: "/a", valid: false};

        expect(describeInspection(report)).toEqual({status: "invalid", message: "Inspection failed."});
    });
});

describe("describeValidationSummary", () => {
    it("summarizes a fully valid report with no issues", () => {
        const report: PokieGamePackageValidationReport = {
            packageRoot: "/a",
            valid: true,
            game: {id: "a", name: "A", version: "1.0.0"},
            errors: [],
            warnings: [],
            suggestions: [],
        };

        expect(describeValidationSummary(report)).toEqual({
            valid: true,
            errors: [],
            warnings: [],
            suggestions: [],
            hasIssues: false,
            blocking: false,
        });
    });

    it("summarizes a report with errors", () => {
        const report: PokieGamePackageValidationReport = {
            packageRoot: "/a",
            valid: false,
            game: null,
            errors: [{code: "pokie-package-load-failed", severity: "error", message: "boom"}],
            warnings: [],
            suggestions: [],
        };

        const summary = describeValidationSummary(report);
        expect(summary.valid).toBe(false);
        expect(summary.hasIssues).toBe(true);
        expect(summary.errors).toEqual([{code: "pokie-package-load-failed", message: "boom"}]);
    });

    it("summarizes a report with only warnings (still valid)", () => {
        const report: PokieGamePackageValidationReport = {
            packageRoot: "/a",
            valid: true,
            game: {id: "a", name: "A", version: "1.0.0"},
            errors: [],
            warnings: [{code: "pokie-game-description-missing", severity: "warning", message: "No description set."}],
            suggestions: ["Add a description to the manifest."],
        };

        const summary = describeValidationSummary(report);
        expect(summary.valid).toBe(true);
        expect(summary.hasIssues).toBe(true);
        expect(summary.warnings).toEqual([{code: "pokie-game-description-missing", message: "No description set."}]);
        expect(summary.suggestions).toEqual(["Add a description to the manifest."]);
    });
});
