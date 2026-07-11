import {GameBlueprint, GameBlueprintValidator} from "pokie";

function validBlueprint(): GameBlueprint {
    return {
        manifest: {id: "crazy-fruits", name: "Crazy Fruits", version: "0.1.0"},
        reels: 5,
        rows: 3,
        symbols: ["A", "K", "Q", "J", "W", "S"],
        wilds: ["W"],
        scatters: ["S"],
        paylines: [
            [1, 1, 1, 1, 1],
            [0, 0, 0, 0, 0],
            [2, 2, 2, 2, 2],
        ],
        paytable: {
            A: {3: 5, 4: 10, 5: 20},
            K: {3: 4, 4: 8, 5: 16},
            Q: {3: 3, 4: 6, 5: 12},
            J: {3: 2, 4: 4, 5: 8},
            S: {3: 2, 4: 5, 5: 10},
        },
        reelStrips: undefined,
    };
}

function codesOf(issues: {code: string}[]): string[] {
    return issues.map((issue) => issue.code);
}

describe("GameBlueprintValidator", () => {
    const validator = new GameBlueprintValidator();

    it("returns no issues for a well-formed blueprint", () => {
        expect(validator.validate(validBlueprint())).toEqual([]);
    });

    it("accepts a blueprint using symbolWeights instead of reelStrips", () => {
        const blueprint = validBlueprint();
        blueprint.symbolWeights = {A: 10, K: 10, Q: 10, J: 10, W: 3, S: 2};

        expect(validator.validate(blueprint).filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it("accepts a blueprint using explicit reelStrips", () => {
        const blueprint = validBlueprint();
        blueprint.reelStrips = new Array(5).fill(["A", "K", "Q", "J", "W", "S"]);

        expect(validator.validate(blueprint).filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it("rejects a non-object blueprint", () => {
        expect(codesOf(validator.validate(null))).toEqual(["blueprint-not-object"]);
        expect(codesOf(validator.validate([1, 2]))).toEqual(["blueprint-not-object"]);
        expect(codesOf(validator.validate("nope"))).toEqual(["blueprint-not-object"]);
    });

    it("flags a missing/invalid manifest", () => {
        const blueprint = {...validBlueprint(), manifest: {id: "", name: "Crazy Fruits"}};

        expect(codesOf(validator.validate(blueprint))).toEqual(
            expect.arrayContaining(["blueprint-manifest-invalid-id", "blueprint-manifest-invalid-version"]),
        );
    });

    it("flags invalid reels/rows", () => {
        const blueprint = {...validBlueprint(), reels: 0, rows: -1};

        expect(codesOf(validator.validate(blueprint))).toEqual(
            expect.arrayContaining(["blueprint-reels-invalid", "blueprint-rows-invalid"]),
        );
    });

    it("flags empty and duplicate symbols", () => {
        expect(codesOf(validator.validate({...validBlueprint(), symbols: []}))).toContain("blueprint-symbols-invalid");
        expect(codesOf(validator.validate({...validBlueprint(), symbols: ["A", "A", "K"]}))).toContain(
            "blueprint-symbols-duplicate",
        );
    });

    it("flags wilds/scatters referencing a symbol not in the symbols list", () => {
        const blueprint = {...validBlueprint(), wilds: ["W", "ZZ"]};

        expect(codesOf(validator.validate(blueprint))).toContain("blueprint-wilds-unknown-symbol");
    });

    it("flags a missing paytable", () => {
        const blueprint = {...validBlueprint()} as Partial<GameBlueprint>;
        Reflect.deleteProperty(blueprint, "paytable");

        expect(codesOf(validator.validate(blueprint))).toContain("blueprint-paytable-missing");
    });

    it("flags a paytable entry for a symbol not in symbols", () => {
        const blueprint = {...validBlueprint(), paytable: {ZZ: {3: 5}}};

        expect(codesOf(validator.validate(blueprint))).toContain("blueprint-paytable-unknown-symbol");
    });

    it("warns (not errors) about a paytable entry for a wild symbol", () => {
        const blueprint = {...validBlueprint(), paytable: {...validBlueprint().paytable, W: {3: 5}}};

        const issues = validator.validate(blueprint);
        const wildIssue = issues.find((issue) => issue.code === "blueprint-paytable-wild-symbol");
        expect(wildIssue?.severity).toBe("warning");
        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it("flags an out-of-range match-count and a non-positive multiplier", () => {
        const blueprint = {...validBlueprint(), paytable: {A: {1: 5, 3: -2, 9: 3}}};

        expect(codesOf(validator.validate(blueprint))).toEqual(
            expect.arrayContaining(["blueprint-paytable-invalid-times", "blueprint-paytable-invalid-multiplier"]),
        );
    });

    it("flags a payline whose length does not match reels", () => {
        const blueprint = {...validBlueprint(), paylines: [[0, 0, 0]]};

        expect(codesOf(validator.validate(blueprint))).toContain("blueprint-payline-invalid");
    });

    it("flags a payline with a row index out of bounds", () => {
        const blueprint = {...validBlueprint(), paylines: [[0, 0, 0, 0, 5]]};

        expect(codesOf(validator.validate(blueprint))).toContain("blueprint-payline-invalid");
    });

    it("flags reelStrips with the wrong reel count or an unknown symbol", () => {
        const wrongCount = {...validBlueprint(), reelStrips: [["A"]]};
        expect(codesOf(validator.validate(wrongCount))).toContain("blueprint-reelstrips-invalid");

        const unknownSymbol = {...validBlueprint(), reelStrips: new Array(5).fill(["ZZ"])};
        expect(codesOf(validator.validate(unknownSymbol))).toContain("blueprint-reelstrip-invalid");
    });

    it("flags symbolWeights with an unknown symbol or a non-positive weight", () => {
        const blueprint = {...validBlueprint(), symbolWeights: {A: 10, ZZ: 5, K: -1}};

        expect(codesOf(validator.validate(blueprint))).toEqual(
            expect.arrayContaining(["blueprint-symbolweights-unknown-symbol", "blueprint-symbolweights-invalid-weight"]),
        );
    });

    it("warns when both reelStrips and symbolWeights are set", () => {
        const blueprint = {
            ...validBlueprint(),
            reelStrips: new Array(5).fill(["A", "K", "Q", "J", "W", "S"]),
            symbolWeights: {A: 10, K: 10, Q: 10, J: 10, W: 3, S: 2},
        };

        const issues = validator.validate(blueprint);
        expect(issues.find((issue) => issue.code === "blueprint-reelstrips-and-weights")?.severity).toBe("warning");
    });

    it("flags a non-positive availableBets entry", () => {
        const blueprint = {...validBlueprint(), availableBets: [1, 0, -5]};

        expect(codesOf(validator.validate(blueprint))).toContain("blueprint-availablebets-invalid");
    });

    it("flags duplicate values in availableBets", () => {
        const blueprint = {...validBlueprint(), availableBets: [1, 2, 2, 5]};

        const issues = validator.validate(blueprint);
        expect(issues.find((issue) => issue.code === "blueprint-availablebets-duplicate")?.severity).toBe("warning");
        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it("flags duplicate ids within wilds/scatters", () => {
        expect(codesOf(validator.validate({...validBlueprint(), wilds: ["W", "W"]}))).toContain(
            "blueprint-wilds-duplicate",
        );
        expect(codesOf(validator.validate({...validBlueprint(), scatters: ["S", "S"]}))).toContain(
            "blueprint-scatters-duplicate",
        );
    });

    it("flags a symbol listed as both a wild and a scatter", () => {
        const blueprint = {...validBlueprint(), scatters: ["W", "S"]};

        expect(codesOf(validator.validate(blueprint))).toContain("blueprint-wilds-scatters-overlap");
    });

    it("flags a paytable entry that pays less for more matches than for fewer matches", () => {
        const blueprint = {...validBlueprint(), paytable: {...validBlueprint().paytable, A: {3: 10, 4: 5, 5: 20}}};

        const issues = validator.validate(blueprint);
        expect(issues.find((issue) => issue.code === "blueprint-paytable-non-monotonic")?.severity).toBe("warning");
        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it("flags a duplicate payline", () => {
        const blueprint = {
            ...validBlueprint(),
            paylines: [
                [0, 0, 0, 0, 0],
                [0, 0, 0, 0, 0],
            ],
        };

        const issues = validator.validate(blueprint);
        expect(issues.find((issue) => issue.code === "blueprint-paylines-duplicate")?.severity).toBe("warning");
        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it("flags a reel strip shorter than rows as suspicious (guaranteed repeats)", () => {
        const blueprint = {
            ...validBlueprint(),
            reelStrips: [
                ["A", "K"],
                ["Q", "J"],
                ["W", "S"],
                ["A", "K"],
                ["Q", "J"],
            ],
        };

        const issues = validator.validate(blueprint);
        expect(issues.find((issue) => issue.code === "blueprint-reelstrip-too-short")?.severity).toBe("warning");
        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });

    it("flags a paytable/wild/scatter symbol that never appears in explicit reelStrips", () => {
        const blueprint = {
            ...validBlueprint(),
            reelStrips: new Array(5).fill(["A", "K", "Q", "W", "S"]), // missing "J", which has a paytable entry
        };

        expect(codesOf(validator.validate(blueprint))).toContain("blueprint-reelstrips-missing-symbol");
    });

    it("flags a paytable/wild/scatter symbol that never appears in explicit symbolWeights", () => {
        const blueprint = {
            ...validBlueprint(),
            symbolWeights: {A: 10, K: 10, Q: 10, J: 10, W: 3}, // missing "S", the scatter
        };

        expect(codesOf(validator.validate(blueprint))).toContain("blueprint-symbolweights-missing-symbol");
    });

    it("flags a non-wild/scatter symbol with no paytable entry", () => {
        const blueprint = {...validBlueprint(), paytable: {A: {3: 5}}};

        const issues = validator.validate(blueprint);
        expect(issues.find((issue) => issue.code === "blueprint-symbol-missing-payout")?.severity).toBe("warning");
    });

    it("flags unusually large reels/rows counts as suspicious, not as an error", () => {
        const blueprint = {...validBlueprint(), reels: 12, rows: 11} as Partial<GameBlueprint>;
        Reflect.deleteProperty(blueprint, "paylines");

        const issues = validator.validate(blueprint);
        expect(issues.find((issue) => issue.code === "blueprint-reels-suspicious")?.severity).toBe("warning");
        expect(issues.find((issue) => issue.code === "blueprint-rows-suspicious")?.severity).toBe("warning");
        expect(issues.filter((issue) => issue.severity === "error")).toEqual([]);
    });
});
