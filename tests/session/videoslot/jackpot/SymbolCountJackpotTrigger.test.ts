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
});

describe("NoJackpotTrigger", () => {
    it("never triggers, regardless of context", () => {
        const trigger = new NoJackpotTrigger<string>();
        const symbols = [["J", "J", "J", "J", "J"]];

        expect(trigger.isTriggered({bet: 100, stake: 100, symbols})).toBe(false);
    });
});
