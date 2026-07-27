import {deriveManifestDefaults} from "../../../cli/scaffold/deriveManifestDefaults.js";

describe("deriveManifestDefaults", () => {
    it("derives id, a title-cased name, and a PascalCase class name from a plain package name", () => {
        expect(deriveManifestDefaults("sample-slot")).toEqual({id: "sample-slot", name: "Sample Slot", className: "SampleSlot"});
    });

    it("derives id, name, and class name from an underscore-separated package name", () => {
        expect(deriveManifestDefaults("sample_slot_deluxe")).toEqual({
            id: "sample_slot_deluxe",
            name: "Sample Slot Deluxe",
            className: "SampleSlotDeluxe",
        });
    });

    it("strips the scope from a scoped package name for id, name, and class name", () => {
        expect(deriveManifestDefaults("@my-org/sample-slot")).toEqual({id: "sample-slot", name: "Sample Slot", className: "SampleSlot"});
    });

    it("falls back to a default id/name/class name when the package has no name", () => {
        expect(deriveManifestDefaults(undefined)).toEqual({id: "my-game", name: "My Game", className: "MyGame"});
    });

    it("falls back to a default id/name/class name when the package name is blank", () => {
        expect(deriveManifestDefaults("   ")).toEqual({id: "my-game", name: "My Game", className: "MyGame"});
    });

    it("uses a single-word name as-is, capitalized", () => {
        expect(deriveManifestDefaults("fruits")).toEqual({id: "fruits", name: "Fruits", className: "Fruits"});
    });
});
