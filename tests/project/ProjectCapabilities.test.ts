import {
    BLUEPRINT_BUILD_CAPABILITY,
    OUTCOME_LIBRARY_READ_CAPABILITY,
    OUTCOME_SOURCE_READ_CAPABILITY,
    OUTCOME_SOURCE_SAMPLE_CAPABILITY,
    PAR_WORKBOOK_EXCHANGE_CAPABILITY,
    RUNTIME_EXECUTE_CAPABILITY,
    STAKE_ADAPTER_EXCHANGE_CAPABILITY,
    WASM_EXPORT_CAPABILITY,
    WASM_MANIFEST_READ_CAPABILITY,
} from "../../src/project/ProjectCapability.js";
import {PROJECT_TYPE_CAPABILITIES} from "../../src/project/ProjectCapabilities.js";

describe("PROJECT_TYPE_CAPABILITIES", () => {
    it("grants blueprint/tsPackage/parWorkbook exactly the one capability their own operations require", () => {
        expect(PROJECT_TYPE_CAPABILITIES.blueprint).toEqual([BLUEPRINT_BUILD_CAPABILITY]);
        expect(PROJECT_TYPE_CAPABILITIES.tsPackage).toEqual([RUNTIME_EXECUTE_CAPABILITY]);
        expect(PROJECT_TYPE_CAPABILITIES.parWorkbook).toEqual([PAR_WORKBOOK_EXCHANGE_CAPABILITY]);
    });

    it("grants outcomeLibrary its own read/build capability plus both outcome-source capabilities", () => {
        expect(PROJECT_TYPE_CAPABILITIES.outcomeLibrary).toEqual([
            OUTCOME_LIBRARY_READ_CAPABILITY,
            OUTCOME_SOURCE_READ_CAPABILITY,
            OUTCOME_SOURCE_SAMPLE_CAPABILITY,
        ]);
    });

    it("grants stakeAdapter its own exchange capability plus outcome-source read, but never sample", () => {
        expect(PROJECT_TYPE_CAPABILITIES.stakeAdapter).toEqual([STAKE_ADAPTER_EXCHANGE_CAPABILITY, OUTCOME_SOURCE_READ_CAPABILITY]);
        expect(PROJECT_TYPE_CAPABILITIES.stakeAdapter).not.toContain(OUTCOME_SOURCE_SAMPLE_CAPABILITY);
    });

    it("grants \"wasm\" only read-only manifest access, never export/build or runtime execution", () => {
        expect(PROJECT_TYPE_CAPABILITIES.wasm).toEqual([WASM_MANIFEST_READ_CAPABILITY]);
        expect(PROJECT_TYPE_CAPABILITIES.wasm).not.toContain(WASM_EXPORT_CAPABILITY);
        expect(PROJECT_TYPE_CAPABILITIES.wasm).not.toContain(RUNTIME_EXECUTE_CAPABILITY);
    });
});
