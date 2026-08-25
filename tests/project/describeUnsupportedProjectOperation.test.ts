import {describeUnsupportedProjectOperation} from "../../src/project/describeUnsupportedProjectOperation.js";
import {
    BUILD_OPERATION,
    CERTIFICATION_BUILD_OPERATION,
    CERTIFICATION_VERIFY_OPERATION,
    OUTCOME_SOURCE_ANALYZE_OPERATION,
    OUTCOME_SOURCE_DIFF_OPERATION,
    OUTCOME_SOURCE_INSPECT_OPERATION,
    OUTCOME_SOURCE_REPLAY_OPERATION,
    OUTCOME_SOURCE_SAMPLE_OPERATION,
    OUTCOME_SOURCE_SERVE_OPERATION,
    OUTCOME_SOURCE_SIMULATE_OPERATION,
    SIM_OPERATION,
    WASM_EXPORT_OPERATION,
    WASM_INSPECT_OPERATION,
    WASM_PACKAGING_PREFLIGHT_OPERATION,
} from "../../src/project/PokieOperation.js";
import type {PokieProject} from "../../src/project/PokieProject.js";
import {PROJECT_TYPE_CAPABILITIES} from "../../src/project/ProjectCapabilities.js";
import type {ProjectType} from "../../src/project/ProjectType.js";

function projectOf(type: ProjectType): PokieProject {
    return {
        type,
        rootPath: `/projects/${type}`,
        capabilities: PROJECT_TYPE_CAPABILITIES[type],
        provenance: "test fixture",
    } as PokieProject;
}

describe("describeUnsupportedProjectOperation", () => {
    it("returns undefined when the project grants the operation's required capability", () => {
        expect(describeUnsupportedProjectOperation(projectOf("tsPackage"), SIM_OPERATION)).toBeUndefined();
        expect(describeUnsupportedProjectOperation(projectOf("blueprint"), BUILD_OPERATION)).toBeUndefined();
    });

    it("returns undefined for an operation this module doesn't recognize at all", () => {
        expect(describeUnsupportedProjectOperation(projectOf("blueprint"), "someUnknownOperation")).toBeUndefined();
    });

    it("names the detected type, operation, and missing capability for an unsupported operation", () => {
        const diagnostic = describeUnsupportedProjectOperation(projectOf("blueprint"), SIM_OPERATION);

        expect(diagnostic).toEqual({
            detectedType: "blueprint",
            operation: SIM_OPERATION,
            missingCapability: "runtime.execute",
            alternatives: ["tsPackage"],
            message: expect.stringContaining("POKIE game package"),
        });
        expect(diagnostic?.message).toContain('Run "pokie inspect <path>"');
        expect(diagnostic?.message).not.toContain("runtime.execute");
        expect(diagnostic?.message).not.toContain("tsPackage");
    });

    it("lists every other project type that already supports the operation as an alternative", () => {
        const diagnostic = describeUnsupportedProjectOperation(projectOf("parWorkbook"), SIM_OPERATION);

        expect(diagnostic?.alternatives).toEqual(["tsPackage"]);
    });

    it("reports no alternatives for an operation no project type currently supports", () => {
        const diagnostic = describeUnsupportedProjectOperation(projectOf("blueprint"), WASM_EXPORT_OPERATION);

        expect(diagnostic).toEqual({
            detectedType: "blueprint",
            operation: WASM_EXPORT_OPERATION,
            missingCapability: "wasm.export",
            alternatives: [],
            message: expect.stringContaining("POKIE cannot build a WASM component for any project yet."),
        });
    });

    it("reports wasm.export as unsupported even for a wasm-typed project", () => {
        const diagnostic = describeUnsupportedProjectOperation(projectOf("wasm"), WASM_EXPORT_OPERATION);

        expect(diagnostic?.missingCapability).toBe("wasm.export");
        expect(diagnostic?.alternatives).toEqual([]);
    });

    it("supports inspect/analyze for both outcomeLibrary and stakeAdapter projects, never via runtime.execute", () => {
        expect(describeUnsupportedProjectOperation(projectOf("outcomeLibrary"), OUTCOME_SOURCE_INSPECT_OPERATION)).toBeUndefined();
        expect(describeUnsupportedProjectOperation(projectOf("outcomeLibrary"), OUTCOME_SOURCE_ANALYZE_OPERATION)).toBeUndefined();
        expect(describeUnsupportedProjectOperation(projectOf("stakeAdapter"), OUTCOME_SOURCE_INSPECT_OPERATION)).toBeUndefined();
        expect(describeUnsupportedProjectOperation(projectOf("stakeAdapter"), OUTCOME_SOURCE_ANALYZE_OPERATION)).toBeUndefined();
    });

    it("supports sampling sim/serve/replay for outcomeLibrary but not stakeAdapter projects", () => {
        expect(describeUnsupportedProjectOperation(projectOf("outcomeLibrary"), OUTCOME_SOURCE_SAMPLE_OPERATION)).toBeUndefined();
        expect(describeUnsupportedProjectOperation(projectOf("outcomeLibrary"), OUTCOME_SOURCE_SERVE_OPERATION)).toBeUndefined();
        expect(describeUnsupportedProjectOperation(projectOf("outcomeLibrary"), OUTCOME_SOURCE_REPLAY_OPERATION)).toBeUndefined();
        expect(describeUnsupportedProjectOperation(projectOf("outcomeLibrary"), OUTCOME_SOURCE_SIMULATE_OPERATION)).toBeUndefined();

        const diagnostic = describeUnsupportedProjectOperation(projectOf("stakeAdapter"), OUTCOME_SOURCE_SAMPLE_OPERATION);
        expect(diagnostic).toEqual({
            detectedType: "stakeAdapter",
            operation: OUTCOME_SOURCE_SAMPLE_OPERATION,
            missingCapability: "outcomeSource.sample",
            alternatives: ["outcomeLibrary"],
            message: expect.stringContaining("Outcome Library"),
        });

        const simulateDiagnostic = describeUnsupportedProjectOperation(projectOf("stakeAdapter"), OUTCOME_SOURCE_SIMULATE_OPERATION);
        expect(simulateDiagnostic).toEqual({
            detectedType: "stakeAdapter",
            operation: OUTCOME_SOURCE_SIMULATE_OPERATION,
            missingCapability: "outcomeSource.sample",
            alternatives: ["outcomeLibrary"],
            message: expect.stringContaining("Outcome Library"),
        });

        const serveDiagnostic = describeUnsupportedProjectOperation(projectOf("stakeAdapter"), OUTCOME_SOURCE_SERVE_OPERATION);
        expect(serveDiagnostic).toEqual({
            detectedType: "stakeAdapter",
            operation: OUTCOME_SOURCE_SERVE_OPERATION,
            missingCapability: "outcomeSource.sample",
            alternatives: ["outcomeLibrary"],
            message: expect.stringContaining("Outcome Library"),
        });
    });

    it("never grants an outcomeLibrary/stakeAdapter project sim/replay/serve via runtime.execute", () => {
        expect(describeUnsupportedProjectOperation(projectOf("outcomeLibrary"), SIM_OPERATION)?.missingCapability).toBe("runtime.execute");
        expect(describeUnsupportedProjectOperation(projectOf("stakeAdapter"), SIM_OPERATION)?.missingCapability).toBe("runtime.execute");
    });

    it("supports diff for both outcomeLibrary and stakeAdapter projects, never via runtime.execute", () => {
        expect(describeUnsupportedProjectOperation(projectOf("outcomeLibrary"), OUTCOME_SOURCE_DIFF_OPERATION)).toBeUndefined();
        expect(describeUnsupportedProjectOperation(projectOf("stakeAdapter"), OUTCOME_SOURCE_DIFF_OPERATION)).toBeUndefined();

        const diagnostic = describeUnsupportedProjectOperation(projectOf("blueprint"), OUTCOME_SOURCE_DIFF_OPERATION);
        expect(diagnostic).toEqual({
            detectedType: "blueprint",
            operation: OUTCOME_SOURCE_DIFF_OPERATION,
            missingCapability: "outcomeSource.read",
            alternatives: ["outcomeLibrary", "stakeAdapter"],
            message: expect.stringContaining("Outcome Library or Stake Engine export"),
        });
    });

    it("supports wasm.inspect only for a wasm project, never via runtime.execute or wasm.export", () => {
        expect(describeUnsupportedProjectOperation(projectOf("wasm"), WASM_INSPECT_OPERATION)).toBeUndefined();

        const diagnostic = describeUnsupportedProjectOperation(projectOf("tsPackage"), WASM_INSPECT_OPERATION);
        expect(diagnostic).toEqual({
            detectedType: "tsPackage",
            operation: WASM_INSPECT_OPERATION,
            missingCapability: "wasm.manifest.read",
            alternatives: ["wasm"],
            message: expect.stringContaining("POKIE WASM component"),
        });
    });

    it("supports wasm.packagingPreflight only for a tsPackage project, never a wasm project", () => {
        expect(describeUnsupportedProjectOperation(projectOf("tsPackage"), WASM_PACKAGING_PREFLIGHT_OPERATION)).toBeUndefined();

        const diagnostic = describeUnsupportedProjectOperation(projectOf("wasm"), WASM_PACKAGING_PREFLIGHT_OPERATION);
        expect(diagnostic).toEqual({
            detectedType: "wasm",
            operation: WASM_PACKAGING_PREFLIGHT_OPERATION,
            missingCapability: "runtime.execute",
            alternatives: ["tsPackage"],
            message: expect.stringContaining("POKIE game package"),
        });
    });

    it("supports certification build/verify for outcomeLibrary only, not stakeAdapter", () => {
        expect(describeUnsupportedProjectOperation(projectOf("outcomeLibrary"), CERTIFICATION_BUILD_OPERATION)).toBeUndefined();
        expect(describeUnsupportedProjectOperation(projectOf("outcomeLibrary"), CERTIFICATION_VERIFY_OPERATION)).toBeUndefined();

        const buildDiagnostic = describeUnsupportedProjectOperation(projectOf("stakeAdapter"), CERTIFICATION_BUILD_OPERATION);
        expect(buildDiagnostic).toEqual({
            detectedType: "stakeAdapter",
            operation: CERTIFICATION_BUILD_OPERATION,
            missingCapability: "outcomeLibrary.read",
            alternatives: ["outcomeLibrary"],
            message: expect.stringContaining("Outcome Library"),
        });

        const verifyDiagnostic = describeUnsupportedProjectOperation(projectOf("stakeAdapter"), CERTIFICATION_VERIFY_OPERATION);
        expect(verifyDiagnostic?.missingCapability).toBe("outcomeLibrary.read");
    });
});
