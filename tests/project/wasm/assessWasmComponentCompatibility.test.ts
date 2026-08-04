import {assessWasmComponentCompatibility} from "../../../src/project/wasm/assessWasmComponentCompatibility.js";
import {POKIE_WASM_CONTRACT_VERSION} from "../../../src/project/wasm/PokieWasmComponentManifest.js";

const VALID_MANIFEST = {
    schemaVersion: POKIE_WASM_CONTRACT_VERSION,
    component: {id: "sample-component", version: "0.1.0"},
    serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"},
    host: {rng: "pokie.rng.v1", services: []},
    capabilities: [],
};

describe("assessWasmComponentCompatibility", () => {
    it("reports a well-formed manifest whose schemaVersion exactly matches the contract version as compatible", () => {
        expect(assessWasmComponentCompatibility(VALID_MANIFEST)).toEqual({compatible: true, issues: []});
    });

    it("reports a manifest whose schemaVersion shares the contract's major but differs in minor/patch as compatible", () => {
        expect(assessWasmComponentCompatibility({...VALID_MANIFEST, schemaVersion: "1.9.3"})).toEqual({compatible: true, issues: []});
    });

    it("reports a manifest with a different major schemaVersion as incompatible, naming both versions", () => {
        const result = assessWasmComponentCompatibility({...VALID_MANIFEST, schemaVersion: "2.0.0"});

        expect(result.compatible).toBe(false);
        expect(result.issues).toContainEqual(
            expect.objectContaining({
                code: "wasm-component-schema-version-incompatible",
                severity: "error",
                message: expect.stringContaining("2.0.0"),
            }),
        );
        expect(result.issues[0]?.message).toContain(POKIE_WASM_CONTRACT_VERSION);
    });

    it("reports a malformed manifest as incompatible, surfacing the validator's own shape issues", () => {
        const result = assessWasmComponentCompatibility({schemaVersion: "1.0.0"});

        expect(result.compatible).toBe(false);
        expect(result.issues.some((issue) => issue.code.startsWith("wasm-component-manifest-"))).toBe(true);
    });

    it("never throws for a completely unrelated value", () => {
        expect(() => assessWasmComponentCompatibility("not a manifest")).not.toThrow();
        expect(assessWasmComponentCompatibility(null).compatible).toBe(false);
    });
});
