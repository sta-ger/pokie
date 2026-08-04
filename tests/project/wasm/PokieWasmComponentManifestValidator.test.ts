import {PokieWasmComponentManifestValidator} from "../../../src/project/wasm/PokieWasmComponentManifestValidator.js";

const VALID_MANIFEST = {
    schemaVersion: "1.0.0",
    component: {id: "sample-component", version: "0.1.0"},
    serialization: {session: "pokie.session.v1", play: "pokie.play.v1", state: "pokie.state.v1"},
    host: {rng: "pokie.rng.v1", services: []},
    capabilities: [],
};

describe("PokieWasmComponentManifestValidator", () => {
    const validator = new PokieWasmComponentManifestValidator();

    it("accepts a well-formed manifest with no issues", () => {
        expect(validator.validate(VALID_MANIFEST)).toEqual([]);
    });

    it("accepts an optional minPokieVersion when it's a valid semver-lite string", () => {
        expect(validator.validate({...VALID_MANIFEST, minPokieVersion: "1.3.0"})).toEqual([]);
    });

    it("rejects a non-object value entirely", () => {
        const issues = validator.validate("not an object");
        expect(issues.some((issue) => issue.severity === "error")).toBe(true);
    });

    it("rejects a missing/invalid schemaVersion", () => {
        const issues = validator.validate({...VALID_MANIFEST, schemaVersion: "not-a-version"});
        expect(issues).toContainEqual(expect.objectContaining({code: "wasm-component-manifest-schema-version-invalid", severity: "error"}));
    });

    it("rejects a missing component object", () => {
        const {component: _component, ...rest} = VALID_MANIFEST;
        const issues = validator.validate(rest);
        expect(issues).toContainEqual(expect.objectContaining({code: "wasm-component-manifest-component-invalid"}));
    });

    it("rejects a component with an empty id or version", () => {
        const issues = validator.validate({...VALID_MANIFEST, component: {id: "", version: ""}});
        expect(issues).toContainEqual(expect.objectContaining({code: "wasm-component-manifest-component-id-invalid"}));
        expect(issues).toContainEqual(expect.objectContaining({code: "wasm-component-manifest-component-version-invalid"}));
    });

    it("rejects an invalid minPokieVersion when present", () => {
        const issues = validator.validate({...VALID_MANIFEST, minPokieVersion: "not-a-version"});
        expect(issues).toContainEqual(expect.objectContaining({code: "wasm-component-manifest-min-pokie-version-invalid"}));
    });

    it("rejects a serialization object missing any of session/play/state", () => {
        const issues = validator.validate({...VALID_MANIFEST, serialization: {session: "pokie.session.v1", play: "", state: "pokie.state.v1"}});
        expect(issues).toContainEqual(
            expect.objectContaining({code: "wasm-component-manifest-serialization-field-invalid", path: "serialization.play"}),
        );
    });

    it("rejects a missing serialization object entirely", () => {
        const {serialization: _serialization, ...rest} = VALID_MANIFEST;
        const issues = validator.validate(rest);
        expect(issues).toContainEqual(expect.objectContaining({code: "wasm-component-manifest-serialization-invalid"}));
    });

    it("rejects a host object with a missing rng or a non-array services", () => {
        const issues = validator.validate({...VALID_MANIFEST, host: {rng: "", services: "not-an-array"}});
        expect(issues).toContainEqual(expect.objectContaining({code: "wasm-component-manifest-host-rng-invalid"}));
        expect(issues).toContainEqual(expect.objectContaining({code: "wasm-component-manifest-host-services-invalid"}));
    });

    it("accepts a non-empty services array and non-empty capabilities array", () => {
        const issues = validator.validate({
            ...VALID_MANIFEST,
            host: {rng: "pokie.rng.v1", services: ["pokie.clock.v1"]},
            capabilities: ["pokie.wasm.replay"],
        });
        expect(issues).toEqual([]);
    });

    it("rejects a capabilities value that isn't an array of non-empty strings", () => {
        const issues = validator.validate({...VALID_MANIFEST, capabilities: ["ok", ""]});
        expect(issues).toContainEqual(expect.objectContaining({code: "wasm-component-manifest-capabilities-invalid"}));
    });

    it("never throws for a deeply malformed value", () => {
        expect(() => validator.validate(null)).not.toThrow();
        expect(() => validator.validate(undefined)).not.toThrow();
        expect(() => validator.validate(42)).not.toThrow();
    });
});
