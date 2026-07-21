import {SymbolCountJackpotTrigger, NoJackpotTrigger} from "pokie";

describe("SymbolCountJackpotTrigger", () => {
    it("triggers when the configured symbol reaches the configured minimum count", () => {
        const trigger = new SymbolCountJackpotTrigger<string>("J", 3);
        const symbols = [
            ["J", "X"],
            ["J", "X"],
            ["J", "X"],
        ];

        expect(trigger.isTriggered({bet: 1, stake: 1, symbols})).toBe(true);
    });

    it("does not trigger below the configured minimum count", () => {
        const trigger = new SymbolCountJackpotTrigger<string>("J", 3);
        const symbols = [
            ["J", "X"],
            ["J", "X"],
            ["X", "X"],
        ];

        expect(trigger.isTriggered({bet: 1, stake: 1, symbols})).toBe(false);
    });

    it("triggers when the count exceeds the minimum", () => {
        const trigger = new SymbolCountJackpotTrigger<string>("J", 2);
        const symbols = [
            ["J", "J"],
            ["J", "X"],
            ["X", "X"],
        ];

        expect(trigger.isTriggered({bet: 1, stake: 1, symbols})).toBe(true);
    });

    describe("minimumCount validation", () => {
        it("rejects zero", () => {
            expect(() => new SymbolCountJackpotTrigger<string>("J", 0)).toThrow(/positive safe integer/);
        });

        it("rejects a negative integer", () => {
            expect(() => new SymbolCountJackpotTrigger<string>("J", -1)).toThrow(/positive safe integer/);
        });

        it("rejects a non-integer", () => {
            expect(() => new SymbolCountJackpotTrigger<string>("J", 1.5)).toThrow(/positive safe integer/);
        });

        it("rejects NaN", () => {
            expect(() => new SymbolCountJackpotTrigger<string>("J", NaN)).toThrow(/positive safe integer/);
        });

        it("rejects Infinity", () => {
            expect(() => new SymbolCountJackpotTrigger<string>("J", Infinity)).toThrow(/positive safe integer/);
        });

        it("rejects an unsafe integer", () => {
            expect(() => new SymbolCountJackpotTrigger<string>("J", Number.MAX_SAFE_INTEGER + 2)).toThrow(/positive safe integer/);
        });

        it("accepts a positive safe integer", () => {
            expect(() => new SymbolCountJackpotTrigger<string>("J", 1)).not.toThrow();
            expect(() => new SymbolCountJackpotTrigger<string>("J", 5)).not.toThrow();
        });
    });
});

describe("NoJackpotTrigger", () => {
    it("never triggers, regardless of context", () => {
        const trigger = new NoJackpotTrigger<string>();
        const symbols = [["J", "J", "J", "J", "J"]];

        expect(trigger.isTriggered({bet: 100, stake: 100, symbols})).toBe(false);
    });
});
