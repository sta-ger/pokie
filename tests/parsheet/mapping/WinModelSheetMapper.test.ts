import {WinModelSheetMapper} from "../../../src/parsheet/mapping/WinModelSheetMapper.js";

describe("WinModelSheetMapper", () => {
    const mapper = new WinModelSheetMapper();

    it("maps a lines win model", () => {
        const {value, issues} = mapper.fromRows([
            ["Key", "Value"],
            ["Type", "lines"],
        ]);

        expect(issues).toEqual([]);
        expect(value).toEqual({type: "lines"});
    });

    it("maps a ways win model", () => {
        const {value, issues} = mapper.fromRows([
            ["Key", "Value"],
            ["Type", "ways"],
        ]);

        expect(issues).toEqual([]);
        expect(value).toEqual({type: "ways"});
    });

    it("maps a clusters win model with a minimum cluster size", () => {
        const {value, issues} = mapper.fromRows([
            ["Key", "Value"],
            ["Type", "clusters"],
            ["Minimum Cluster Size", 5],
        ]);

        expect(issues).toEqual([]);
        expect(value).toEqual({type: "clusters", minimumClusterSize: 5});
    });

    it("maps a clusters win model with no minimum cluster size", () => {
        const {value, issues} = mapper.fromRows([
            ["Key", "Value"],
            ["Type", "clusters"],
        ]);

        expect(issues).toEqual([]);
        expect(value).toEqual({type: "clusters"});
    });

    it("is case-insensitive about the Type value", () => {
        const {value, issues} = mapper.fromRows([
            ["Key", "Value"],
            ["Type", "Ways"],
        ]);

        expect(issues).toEqual([]);
        expect(value).toEqual({type: "ways"});
    });

    it("reports a missing Type value and returns undefined", () => {
        const {value, issues} = mapper.fromRows([["Key", "Value"]]);

        expect(value).toBeUndefined();
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-winmodel-missing-type", severity: "error"})]);
    });

    it("reports an invalid Type value and returns undefined, without silently defaulting to lines", () => {
        const {value, issues} = mapper.fromRows([
            ["Key", "Value"],
            ["Type", "megaways"],
        ]);

        expect(value).toBeUndefined();
        expect(issues).toEqual([
            expect.objectContaining({code: "parsheet-winmodel-invalid-type", severity: "error", details: {sheet: "WinModel", type: "megaways"}}),
        ]);
    });

    it("warns (but doesn't error) when Minimum Cluster Size is set for a non-clusters type", () => {
        const {value, issues} = mapper.fromRows([
            ["Key", "Value"],
            ["Type", "lines"],
            ["Minimum Cluster Size", 5],
        ]);

        expect(value).toEqual({type: "lines"});
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-winmodel-cluster-size-ignored", severity: "warning"})]);
    });

    it("reports a non-numeric Minimum Cluster Size for a clusters type, instead of silently dropping it", () => {
        const {value, issues} = mapper.fromRows([
            ["Key", "Value"],
            ["Type", "clusters"],
            ["Minimum Cluster Size", "five"],
        ]);

        expect(value).toEqual({type: "clusters"});
        expect(issues).toEqual([
            expect.objectContaining({
                code: "parsheet-winmodel-invalid-cluster-size",
                severity: "error",
                details: {sheet: "WinModel", minimumClusterSize: "five"},
            }),
        ]);
    });

    it("reports a non-numeric Minimum Cluster Size even for a non-clusters type (still lost, still not silent)", () => {
        const {value, issues} = mapper.fromRows([
            ["Key", "Value"],
            ["Type", "lines"],
            ["Minimum Cluster Size", "five"],
        ]);

        expect(value).toEqual({type: "lines"});
        expect(issues).toEqual([expect.objectContaining({code: "parsheet-winmodel-invalid-cluster-size", severity: "error"})]);
        // Malformed and "doesn't apply to this type" are two different problems -- only one is reported here.
        expect(issues.some((issue) => issue.code === "parsheet-winmodel-cluster-size-ignored")).toBe(false);
    });

    it("does not treat a present-but-blank Minimum Cluster Size cell as malformed", () => {
        const {value, issues} = mapper.fromRows([
            ["Key", "Value"],
            ["Type", "clusters"],
            ["Minimum Cluster Size", ""],
        ]);

        expect(value).toEqual({type: "clusters"});
        expect(issues).toEqual([]);
    });

    it("warns about an unrecognized key", () => {
        const {issues} = mapper.fromRows([
            ["Key", "Value"],
            ["Type", "lines"],
            ["Volatility", "high"],
        ]);

        expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({code: "parsheet-winmodel-unknown-key", severity: "warning"})]));
    });

    it("warns about a duplicate key, using the last value", () => {
        const {value, issues} = mapper.fromRows([
            ["Key", "Value"],
            ["Type", "lines"],
            ["Type", "ways"],
        ]);

        expect(value).toEqual({type: "ways"});
        expect(issues).toEqual(expect.arrayContaining([expect.objectContaining({code: "parsheet-winmodel-duplicate-key", severity: "warning"})]));
    });

    it.each([[{type: "lines"} as const], [{type: "ways"} as const], [{type: "clusters", minimumClusterSize: 4} as const], [{type: "clusters"} as const]])(
        "round-trips toRows -> fromRows back to the original win model (%j)",
        (original) => {
            const {value, issues} = mapper.fromRows(mapper.toRows(original));

            expect(issues).toEqual([]);
            expect(value).toEqual(original);
        },
    );
});
