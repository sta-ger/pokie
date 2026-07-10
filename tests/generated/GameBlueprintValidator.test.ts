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
});
