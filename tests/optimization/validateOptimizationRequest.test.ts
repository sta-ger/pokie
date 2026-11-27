import {validateOptimizationRequest} from "../../src/optimization/validateOptimizationRequest.js";
import {optimizationRequest} from "../contracts/fixtures/OptimizationFixture.js";

describe("validateOptimizationRequest", () => {
    it("defaults an omitted lock list to no additional locks", () => {
        const request = optimizationRequest();
        Reflect.deleteProperty(request.policy, "locks");

        expect(validateOptimizationRequest(request).policy.locks).toEqual([]);
    });
});
