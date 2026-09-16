import {
    BLUEPRINT_BUILD_CAPABILITY,
    OUTCOME_LIBRARY_READ_CAPABILITY,
    OUTCOME_LIBRARY_GENERATE_CAPABILITY,
    OUTCOME_SOURCE_READ_CAPABILITY,
    OUTCOME_SOURCE_SAMPLE_CAPABILITY,
    PAR_WORKBOOK_EXCHANGE_CAPABILITY,
    RUNTIME_EXECUTE_CAPABILITY,
    STAKE_ADAPTER_EXCHANGE_CAPABILITY,
    STAKE_ADAPTER_EXPORT_CAPABILITY,
    WASM_EXPORT_CAPABILITY,
    WASM_MANIFEST_READ_CAPABILITY,
} from "../../src/project/ProjectCapability.js";
import {PROJECT_TYPE_CAPABILITIES, wasmProjectCapabilities} from "../../src/project/ProjectCapabilities.js";

describe("PROJECT_TYPE_CAPABILITIES", () => {
    it("grants Blueprint its package build and registry-owned Outcome/Stake/WASM prerequisite capabilities", () => {
        expect(PROJECT_TYPE_CAPABILITIES.blueprint).toEqual([BLUEPRINT_BUILD_CAPABILITY, OUTCOME_LIBRARY_GENERATE_CAPABILITY, STAKE_ADAPTER_EXPORT_CAPABILITY, WASM_EXPORT_CAPABILITY]);
    });

    it("grants tsPackage its runtime and registry-owned Outcome/Stake capabilities", () => {
        expect(PROJECT_TYPE_CAPABILITIES.tsPackage).toEqual([RUNTIME_EXECUTE_CAPABILITY, OUTCOME_LIBRARY_GENERATE_CAPABILITY, STAKE_ADAPTER_EXPORT_CAPABILITY]);
        expect(PROJECT_TYPE_CAPABILITIES.parWorkbook).toEqual([PAR_WORKBOOK_EXCHANGE_CAPABILITY, WASM_EXPORT_CAPABILITY]);
    });

    it("grants outcomeLibrary its own read/build capability, both outcome-source capabilities, and Stake export", () => {
        expect(PROJECT_TYPE_CAPABILITIES.outcomeLibrary).toEqual([
            OUTCOME_LIBRARY_READ_CAPABILITY,
            OUTCOME_LIBRARY_GENERATE_CAPABILITY,
            OUTCOME_SOURCE_READ_CAPABILITY,
            OUTCOME_SOURCE_SAMPLE_CAPABILITY,
            STAKE_ADAPTER_EXPORT_CAPABILITY,
        ]);
    });

    it("grants stakeAdapter its own exchange/export capabilities plus outcome-source read, but never sample", () => {
        expect(PROJECT_TYPE_CAPABILITIES.stakeAdapter).toEqual([STAKE_ADAPTER_EXCHANGE_CAPABILITY, STAKE_ADAPTER_EXPORT_CAPABILITY, OUTCOME_SOURCE_READ_CAPABILITY]);
        expect(PROJECT_TYPE_CAPABILITIES.stakeAdapter).not.toContain(OUTCOME_SOURCE_SAMPLE_CAPABILITY);
    });

    it("grants \"wasm\" only read-only manifest access, never export/build or runtime execution", () => {
        expect(PROJECT_TYPE_CAPABILITIES.wasm).toEqual([WASM_MANIFEST_READ_CAPABILITY]);
        expect(PROJECT_TYPE_CAPABILITIES.wasm).not.toContain(WASM_EXPORT_CAPABILITY);
        expect(PROJECT_TYPE_CAPABILITIES.wasm).not.toContain(RUNTIME_EXECUTE_CAPABILITY);
    });

    it("derives canonical WASM operations from supported host contracts and per-operation declarations", () => {
        const manifest = {
            artifact: {format: "pokie.wasm.v1" as const},
            serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"},
            host: {rng: "pokie.rng.v1", services: []},
            capabilities: ["runtime.play", "runtime.serialize", "artifact.inspect"],
        };
        expect(wasmProjectCapabilities(manifest as never)).toEqual(["wasm.manifest.read", "wasm.canonical", "wasm.runtime.play", "wasm.runtime.serialize", "wasm.artifact.inspect"]);
        expect(wasmProjectCapabilities({...manifest, host: {rng: "other.rng.v1", services: []}} as never)).toEqual(["wasm.manifest.read"]);
    });
});
