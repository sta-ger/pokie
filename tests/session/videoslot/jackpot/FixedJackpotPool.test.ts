import {FixedJackpotPool} from "../../../../src/session/videoslot/jackpot/FixedJackpotPool.js";

describe("FixedJackpotPool", () => {
    it("reports the configured amount as both its current value and its award", () => {
        const pool = new FixedJackpotPool("mini", 500);

        expect(pool.getId()).toBe("mini");
        expect(pool.getValue()).toBe(500);
        expect(pool.award()).toBe(500);
    });

    it("never grows via contribute()", () => {
        const pool = new FixedJackpotPool("mini", 500);

        pool.contribute(1000);

        expect(pool.getValue()).toBe(500);
    });

    it("stays at the same amount after being awarded", () => {
        const pool = new FixedJackpotPool("mini", 500);

        pool.award();

        expect(pool.getValue()).toBe(500);
        expect(pool.award()).toBe(500);
    });

    it("rejects a negative amount", () => {
        expect(() => new FixedJackpotPool("mini", -1)).toThrow(/finite number >= 0/);
    });

    it("rejects a non-finite amount", () => {
        expect(() => new FixedJackpotPool("mini", Infinity)).toThrow(/finite number >= 0/);
        expect(() => new FixedJackpotPool("mini", NaN)).toThrow(/finite number >= 0/);
    });
});
