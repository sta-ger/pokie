import {MinimumCountHoldAndWinTrigger} from "../../../../src/session/videoslot/holdandwin/MinimumCountHoldAndWinTrigger.js";

describe("MinimumCountHoldAndWinTrigger", () => {
    const value = {kind: "value" as const, amount: 10};
    const candidate = (reelId: number) => ({position: [reelId, 0] as [number, number], symbolId: "C", effect: value});

    it("triggers when candidates reach the configured minimum count", () => {
        const trigger = new MinimumCountHoldAndWinTrigger<string>(3);
        expect(trigger.isTriggered([candidate(0), candidate(1), candidate(2)])).toBe(true);
    });

    it("triggers when candidates exceed the configured minimum count", () => {
        const trigger = new MinimumCountHoldAndWinTrigger<string>(3);
        expect(trigger.isTriggered([candidate(0), candidate(1), candidate(2), candidate(3)])).toBe(true);
    });

    it("does not trigger below the configured minimum count", () => {
        const trigger = new MinimumCountHoldAndWinTrigger<string>(3);
        expect(trigger.isTriggered([candidate(0), candidate(1)])).toBe(false);
    });

    it("does not trigger on zero candidates", () => {
        const trigger = new MinimumCountHoldAndWinTrigger<string>(3);
        expect(trigger.isTriggered([])).toBe(false);
    });
});
