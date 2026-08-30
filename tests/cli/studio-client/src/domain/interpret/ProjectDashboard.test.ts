import {describeProjectHeader, describeValidationSummary} from "../../../../../../cli/studio-client/src/domain/interpret/ProjectDashboard";
import type {PokieGamePackageValidationReport} from "../../../../../../cli/studio-client/src/api/types";

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

    it("translates an error state into actionable opening guidance and keeps its diagnostic as technical detail", () => {
        expect(describeProjectHeader({status: "error", projectRoot: "/a", error: "boom"})).toEqual({
            status: "error",
            projectRoot: "/a",
            message: "We couldn't open this game. Return to your games and try opening it again. If it continues, check the game's location and reopen Studio.",
            errorDetail: "boom",
        });
    });

    it("keeps both materialization diagnostics behind the designer-facing opening guidance", () => {
        expect(
            describeProjectHeader({status: "error", projectRoot: "/a", error: "Installing dependencies failed.", errorDetail: "npm ERR! simulated failure"}),
        ).toEqual({
            status: "error",
            projectRoot: "/a",
            message: "We couldn't open this game. Return to your games and try opening it again. If it continues, check the game's location and reopen Studio.",
            errorDetail: "Installing dependencies failed.\n\nnpm ERR! simulated failure",
        });
    });

    it("shows a safe planner diagnostic directly, including its path, failed edge, and recovery", () => {
        const diagnostic = "Cannot prepare a runnable runtime from \\\"/a\\\". Attempted path: parWorkbook -> blueprint -> tsPackage; blocker at parWorkbook -> blueprint: required sheet is missing. Next: restore the required sheet and try again.";

        expect(describeProjectHeader({status: "error", projectRoot: "/a", error: diagnostic})).toEqual({
            status: "error",
            projectRoot: "/a",
            message: diagnostic,
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

    it("preserves an exchange-only artifact's own capability for Build/Export", () => {
        expect(
            describeProjectHeader({
                status: "artifact",
                projectRoot: "/a/sheet.xlsx",
                project: {type: "parWorkbook", rootPath: "/a/sheet.xlsx", capabilities: ["parWorkbook.exchange"], provenance: "test workbook"},
            }),
        ).toEqual({
            status: "artifact",
            projectRoot: "/a/sheet.xlsx",
            type: "parWorkbook",
            capabilities: ["parWorkbook.exchange"],
            origin: undefined,
        });
    });

    it("carries the server-provided WASM presentation into the inspection-only dashboard", () => {
        const wasmPresentation = {
            label: "WASM component (inspection-only)",
            manifestCapability: "wasm.manifest.read",
            manifestCapabilityLabel: "Inspect declared WASM component metadata",
            inspectActionLabel: "Inspect this component",
            inspectionSummary: "POKIE reads compatible component metadata only.",
        };

        expect(
            describeProjectHeader({
                status: "artifact",
                projectRoot: "/a/component.wasm",
                project: {type: "wasm", rootPath: "/a/component.wasm", capabilities: ["wasm.manifest.read"], provenance: "compatible sidecar"},
                wasmPresentation,
            }),
        ).toEqual({
            status: "artifact",
            projectRoot: "/a/component.wasm",
            type: "wasm",
            capabilities: ["wasm.manifest.read"],
            origin: undefined,
            wasmPresentation,
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
