import {
    BLUEPRINT_BUILD_CAPABILITY,
    OUTCOME_LIBRARY_READ_CAPABILITY,
    PAR_WORKBOOK_EXCHANGE_CAPABILITY,
    RUNTIME_EXECUTE_CAPABILITY,
    STAKE_ADAPTER_EXCHANGE_CAPABILITY,
} from "../../src/project/ProjectCapability.js";
import {PROJECT_TYPE_CAPABILITIES} from "../../src/project/ProjectCapabilities.js";

describe("PROJECT_TYPE_CAPABILITIES", () => {
    it("grants each project type exactly the one capability its own operations require", () => {
        expect(PROJECT_TYPE_CAPABILITIES.blueprint).toEqual([BLUEPRINT_BUILD_CAPABILITY]);
        expect(PROJECT_TYPE_CAPABILITIES.tsPackage).toEqual([RUNTIME_EXECUTE_CAPABILITY]);
        expect(PROJECT_TYPE_CAPABILITIES.outcomeLibrary).toEqual([OUTCOME_LIBRARY_READ_CAPABILITY]);
        expect(PROJECT_TYPE_CAPABILITIES.stakeAdapter).toEqual([STAKE_ADAPTER_EXCHANGE_CAPABILITY]);
        expect(PROJECT_TYPE_CAPABILITIES.parWorkbook).toEqual([PAR_WORKBOOK_EXCHANGE_CAPABILITY]);
    });

    it("grants \"wasm\" no capabilities, since no operation against it is supported yet", () => {
        expect(PROJECT_TYPE_CAPABILITIES.wasm).toEqual([]);
    });
});
