import {ArtifactBuilderRegistry} from "../../src/project/ArtifactBuilderRegistry.js";
import {
    BLUEPRINT_BUILD_CAPABILITY,
    OUTCOME_LIBRARY_READ_CAPABILITY,
    PAR_WORKBOOK_EXCHANGE_CAPABILITY,
    STAKE_ADAPTER_EXCHANGE_CAPABILITY,
    WASM_EXPORT_CAPABILITY,
} from "../../src/project/ProjectCapability.js";

describe("ArtifactBuilderRegistry", () => {
    const registry = new ArtifactBuilderRegistry();

    it("lists exactly the five buildable target types", () => {
        expect(new Set(registry.listTargets())).toEqual(new Set(["tsPackage", "outcomeLibrary", "stakeAdapter", "parWorkbook", "wasm"]));
    });

    it("reports the true required source capability and supported sources for a package build", () => {
        const descriptor = registry.describe("tsPackage");

        expect(descriptor.requiredSourceCapability).toBe(BLUEPRINT_BUILD_CAPABILITY);
        expect(descriptor.supportedSources).toEqual(["blueprint"]);
    });

    it("reports the true required source capability and supported sources for an outcome-library build", () => {
        const descriptor = registry.describe("outcomeLibrary");

        expect(descriptor.requiredSourceCapability).toBe(OUTCOME_LIBRARY_READ_CAPABILITY);
        expect(descriptor.supportedSources).toEqual(["outcomeLibrary"]);
    });

    it("reports the true required source capability and supported sources for a Stake artifact export", () => {
        const descriptor = registry.describe("stakeAdapter");

        expect(descriptor.requiredSourceCapability).toBe(STAKE_ADAPTER_EXCHANGE_CAPABILITY);
        expect(descriptor.supportedSources).toEqual(["stakeAdapter"]);
    });

    it("reports the true required source capability and supported sources for a PAR export", () => {
        const descriptor = registry.describe("parWorkbook");

        expect(descriptor.requiredSourceCapability).toBe(PAR_WORKBOOK_EXCHANGE_CAPABILITY);
        expect(descriptor.supportedSources).toEqual(["parWorkbook"]);
    });

    it("truthfully reports wasm as buildable from no source type today", () => {
        const descriptor = registry.describe("wasm");

        expect(descriptor.requiredSourceCapability).toBe(WASM_EXPORT_CAPABILITY);
        expect(descriptor.supportedSources).toEqual([]);
    });

    it("never promises reversible model recovery from an outcome-based artifact", () => {
        const outcomeLibraryNotes = registry.describe("outcomeLibrary").unsupportedNotes.join(" ");
        const stakeAdapterNotes = registry.describe("stakeAdapter").unsupportedNotes.join(" ");

        expect(outcomeLibraryNotes).toMatch(/never re-derives or recovers the game model/);
        expect(stakeAdapterNotes).toMatch(/never re-derives or recovers the game model/);
    });

    it("never promises arbitrary package-to-WASM compilation", () => {
        const wasmNotes = registry.describe("wasm").unsupportedNotes.join(" ");
        const tsPackageNotes = registry.describe("tsPackage").unsupportedNotes.join(" ");

        expect(wasmNotes).toMatch(/no arbitrary package-to-WASM compiler/);
        expect(tsPackageNotes).toMatch(/never compiles or targets WASM/);
    });

    it("throws for a target it has no descriptor for", () => {
        expect(() => registry.describe("bogus" as never)).toThrow(/no descriptor for target "bogus"/);
    });

    describe("supportsConversionFrom", () => {
        it("agrees with the descriptor's own supportedSources", () => {
            expect(registry.supportsConversionFrom("tsPackage", "blueprint")).toBe(true);
            expect(registry.supportsConversionFrom("tsPackage", "tsPackage")).toBe(false);
            expect(registry.supportsConversionFrom("wasm", "tsPackage")).toBe(false);
            expect(registry.supportsConversionFrom("wasm", "blueprint")).toBe(false);
        });
    });
});
