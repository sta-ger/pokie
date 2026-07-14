import {ManifestSheetMapper} from "../../../src/parsheet/mapping/ManifestSheetMapper.js";

describe("ManifestSheetMapper", () => {
    const mapper = new ManifestSheetMapper();

    it("maps a well-formed grid to a manifest/reels/rows value with no issues", () => {
        const {value, issues} = mapper.fromRows([
            ["Key", "Value"],
            ["Id", "crazy-fruits"],
            ["Name", "Crazy Fruits"],
            ["Version", "0.1.0"],
            ["Description", "A demo game"],
            ["Author", "sta-ger"],
            ["Reels", 5],
            ["Rows", 3],
        ]);

        expect(issues).toEqual([]);
        expect(value).toEqual({
            manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0", description: "A demo game", author: "sta-ger"},
            reels: 5,
            rows: 3,
        });
    });

    it("omits description/author from the manifest when their rows are blank", () => {
        const {value} = mapper.fromRows([
            ["Key", "Value"],
            ["Id", "crazy-fruits"],
            ["Name", "Crazy Fruits"],
            ["Version", "0.1.0"],
            ["Reels", 5],
            ["Rows", 3],
        ]);

        expect(value.manifest).toEqual({id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"});
    });

    it("defaults to empty/zero values when required rows are missing entirely, without throwing", () => {
        const {value} = mapper.fromRows([["Key", "Value"]]);

        expect(value).toEqual({manifest: {id: "", name: "", version: ""}, reels: 0, rows: 0});
    });

    it("reports missing Key/Value columns", () => {
        const {issues} = mapper.fromRows([["Field", "Data"]]);

        expect(issues).toEqual(
            expect.arrayContaining([
                expect.objectContaining({code: "parsheet-missing-column", severity: "error", details: {sheet: "Manifest", column: "Key"}}),
                expect.objectContaining({code: "parsheet-missing-column", severity: "error", details: {sheet: "Manifest", column: "Value"}}),
            ]),
        );
    });

    it("warns about an unrecognized row key and ignores it", () => {
        const {value, issues} = mapper.fromRows([
            ["Key", "Value"],
            ["Studio", "Acme"],
        ]);

        expect(issues).toEqual([expect.objectContaining({code: "parsheet-manifest-unknown-key", severity: "warning"})]);
        expect(value.manifest).toEqual({id: "", name: "", version: ""});
    });

    it("warns about a duplicate row key and keeps the last value", () => {
        const {value, issues} = mapper.fromRows([
            ["Key", "Value"],
            ["Id", "first"],
            ["Id", "second"],
        ]);

        expect(issues).toEqual([expect.objectContaining({code: "parsheet-manifest-duplicate-key", severity: "warning"})]);
        expect(value.manifest.id).toBe("second");
    });

    it("skips blank rows", () => {
        const {value, issues} = mapper.fromRows([
            ["Key", "Value"],
            ["", ""],
            ["Id", "crazy-fruits"],
        ]);

        expect(issues).toEqual([]);
        expect(value.manifest.id).toBe("crazy-fruits");
    });

    it("round-trips toRows -> fromRows back to the original manifest/reels/rows", () => {
        const manifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0", description: "A demo game", author: "sta-ger"};
        const rows = mapper.toRows(manifest, 5, 3);
        const {value, issues} = mapper.fromRows(rows);

        expect(issues).toEqual([]);
        expect(value).toEqual({manifest, reels: 5, rows: 3});
    });

    it("round-trips a manifest with no description/author back to a manifest without those keys at all", () => {
        const manifest = {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"};
        const rows = mapper.toRows(manifest, 5, 3);
        const {value, issues} = mapper.fromRows(rows);

        expect(issues).toEqual([]);
        expect(value.manifest).toEqual(manifest);
        expect(value.manifest).not.toHaveProperty("description");
        expect(value.manifest).not.toHaveProperty("author");
    });
});
