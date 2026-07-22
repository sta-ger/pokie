import {
    describeInspection,
    describeProjectHeader,
    describeProvenance,
    describeValidationSummary,
} from "../../../../../../cli/studio-client/src/domain/interpret/ProjectDashboard";
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
            game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0", description: "A fruit slot"},
        });

        expect(view).toEqual({
            status: "loaded",
            projectRoot: "/a",
            id: "crazy-fruits",
            name: "Crazy Fruits",
            version: "0.1.0",
            description: "A fruit slot",
        });
    });

    it("leaves description undefined when the manifest doesn't have one", () => {
        const view = describeProjectHeader({
            status: "loaded",
            projectRoot: "/a",
            game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
        });

        expect(view).toEqual({status: "loaded", projectRoot: "/a", id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0", description: undefined});
    });
});

describe("describeProvenance", () => {
    it("reports not-generated for a package with no buildInfo (pokie create/init scaffold)", () => {
        const report: GamePackageInspectionReport = {
            packageRoot: "/a",
            valid: true,
            packageJson: {name: "a", version: "1.0.0"},
            generated: false,
        };

        expect(describeProvenance(report)).toEqual({status: "not-generated"});
    });

    it("reports not-generated for a package whose build-info.json was corrupt/unparseable", () => {
        // GamePackageInspector.readBuildInfo already treats a build-info.json that fails to parse
        // (or wasn't written by "pokie build") the same as "absent" — describeProvenance must not
        // second-guess that and invent a separate state for it.
        const report: GamePackageInspectionReport = {
            packageRoot: "/a",
            valid: true,
            packageJson: {name: "a", version: "1.0.0"},
            generated: false,
        };

        expect(describeProvenance(report)).toEqual({status: "not-generated"});
    });

    it("reports error (not not-generated) for an invalid/unreadable package (missing or corrupt package.json)", () => {
        const report: GamePackageInspectionReport = {
            packageRoot: "/a",
            valid: false,
            generated: false,
            error: '"/a/package.json" does not exist.',
        };

        expect(describeProvenance(report)).toEqual({status: "error", message: '"/a/package.json" does not exist.'});
    });

    it("falls back to a generic message when an invalid report has no error text", () => {
        const report: GamePackageInspectionReport = {packageRoot: "/a", valid: false, generated: false};

        expect(describeProvenance(report)).toEqual({status: "error", message: "Inspection failed."});
    });

    it("extracts buildInfo fields for a generated package", () => {
        const report: GamePackageInspectionReport = {
            packageRoot: "/a",
            valid: true,
            packageJson: {name: "a", version: "0.1.0"},
            generated: true,
            buildInfo: {
                schemaVersion: 1,
                generatedBy: "pokie build",
                pokieVersion: "1.3.0",
                generatedAt: "2026-01-02T03:04:05.000Z",
                blueprintHash: "sha256:abc123",
                source: "crazy-fruits.blueprint.json",
                files: ["package.json", "src/generated/index.js"],
                game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
            },
        };

        expect(describeProvenance(report)).toEqual({
            status: "generated",
            blueprintHash: "sha256:abc123",
            source: "crazy-fruits.blueprint.json",
            pokieVersion: "1.3.0",
            generatedAt: "2026-01-02T03:04:05.000Z",
            files: ["package.json", "src/generated/index.js"],
        });
    });

    it('defaults an unknown source to "(unknown)" and files to an empty list', () => {
        const report: GamePackageInspectionReport = {
            packageRoot: "/a",
            valid: true,
            generated: true,
            buildInfo: {
                schemaVersion: 1,
                generatedBy: "pokie build",
                pokieVersion: "1.3.0",
                generatedAt: "2026-01-02T03:04:05.000Z",
                blueprintHash: "sha256:abc123",
                game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
            },
        };

        const view = describeProvenance(report);
        expect(view).toEqual(
            expect.objectContaining({status: "generated", source: "(unknown)", files: []}),
        );
    });
});

describe("describeInspection", () => {
    it("wraps a valid, not-generated report with its package name/version/root", () => {
        const report: GamePackageInspectionReport = {
            packageRoot: "/a",
            valid: true,
            packageJson: {name: "a", version: "1.0.0"},
            generated: false,
        };

        expect(describeInspection(report)).toEqual({
            status: "loaded",
            packageRoot: "/a",
            packageName: "a",
            packageVersion: "1.0.0",
            provenance: {status: "not-generated"},
        });
    });

    it("wraps a generated report with its provenance", () => {
        const report: GamePackageInspectionReport = {
            packageRoot: "/a",
            valid: true,
            packageJson: {name: "a", version: "0.1.0"},
            generated: true,
            buildInfo: {
                schemaVersion: 1,
                generatedBy: "pokie build",
                pokieVersion: "1.3.0",
                generatedAt: "2026-01-02T03:04:05.000Z",
                blueprintHash: "sha256:abc123",
                source: "crazy-fruits.blueprint.json",
                files: ["package.json"],
                game: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
            },
        };

        const view = describeInspection(report);
        expect(view.status).toBe("loaded");
        if (view.status === "loaded") {
            expect(view.provenance).toEqual({
                status: "generated",
                blueprintHash: "sha256:abc123",
                source: "crazy-fruits.blueprint.json",
                pokieVersion: "1.3.0",
                generatedAt: "2026-01-02T03:04:05.000Z",
                files: ["package.json"],
            });
        }
    });

    it("wraps an invalid report as loaded, with the error carried by its nested provenance", () => {
        const report: GamePackageInspectionReport = {
            packageRoot: "/a",
            valid: false,
            generated: false,
            error: '"/a/package.json" does not exist.',
        };

        expect(describeInspection(report)).toEqual({
            status: "loaded",
            packageRoot: "/a",
            packageName: undefined,
            packageVersion: undefined,
            provenance: {status: "error", message: '"/a/package.json" does not exist.'},
        });
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
