import {GameBlueprint} from "../../../src/generated/GameBlueprint.js";
import {ProvenanceSheetMapper} from "../../../src/parsheet/mapping/ProvenanceSheetMapper.js";

describe("ProvenanceSheetMapper", () => {
    const mapper = new ProvenanceSheetMapper();
    const blueprint: GameBlueprint = {
        manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
        reels: 3,
        rows: 3,
        symbols: ["A"],
        paytable: {A: {"3": 5}},
    };

    it("writes schema version/pokie version/timestamp/source/hash to the Meta sheet", () => {
        const rows = mapper.toRows(blueprint, "1.3.0", new Date("2026-01-01T00:00:00.000Z"), "config.json");

        expect(rows).toEqual([
            ["Key", "Value"],
            ["Schema Version", 1],
            ["Pokie Version", "1.3.0"],
            ["Exported At", "2026-01-01T00:00:00.000Z"],
            ["Source", "config.json"],
            ["Blueprint Hash", expect.stringMatching(/^sha256:[0-9a-f]{64}$/)],
        ]);
    });

    it("writes an empty Source cell when no source path is given", () => {
        const rows = mapper.toRows(blueprint, "1.3.0", new Date(), undefined);

        expect(rows[4]).toEqual(["Source", ""]);
    });

    it("parses the Meta sheet back into provenance and reports it as an informational issue", () => {
        const rows = mapper.toRows(blueprint, "1.3.0", new Date("2026-01-01T00:00:00.000Z"), "config.json");

        const {value, issues} = mapper.fromRows(rows);

        expect(value.pokieVersion).toBe("1.3.0");
        expect(value.schemaVersion).toBe(1);
        expect(value.exportedAt).toBe("2026-01-01T00:00:00.000Z");
        expect(value.source).toBe("config.json");
        expect(value.blueprintHash).toMatch(/^sha256:[0-9a-f]{64}$/);
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-provenance-present", severity: "info"})]);
    });

    it("returns no value and no issues for an empty sheet", () => {
        const {value, issues} = mapper.fromRows([]);

        expect(value).toEqual({});
        expect(issues).toEqual([]);
    });
});
