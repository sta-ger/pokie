import {AccumulatingJackpotPool} from "pokie";

describe("AccumulatingJackpotPool", () => {
    it("starts at the configured seed value", () => {
        const pool = new AccumulatingJackpotPool("grand", 1000);

        expect(pool.getId()).toBe("grand");
        expect(pool.getValue()).toBe(1000);
    });

    it("grows by every contribution", () => {
        const pool = new AccumulatingJackpotPool("grand", 1000);

        pool.contribute(50);
        pool.contribute(25);

        expect(pool.getValue()).toBe(1075);
    });

    it("ignores a non-positive contribution", () => {
        const pool = new AccumulatingJackpotPool("grand", 1000);

        pool.contribute(0);
        pool.contribute(-10);

        expect(pool.getValue()).toBe(1000);
    });

    it("award() returns the current accumulated value and resets back to the seed value", () => {
        const pool = new AccumulatingJackpotPool("grand", 1000);
        pool.contribute(500);

        const awarded = pool.award();

        expect(awarded).toBe(1500);
        expect(pool.getValue()).toBe(1000); // reset, not zeroed
    });

    it("resumes growing normally after an award", () => {
        const pool = new AccumulatingJackpotPool("grand", 1000);
        pool.contribute(500);
        pool.award();

        pool.contribute(200);

        expect(pool.getValue()).toBe(1200);
    });

    it("captures and restores its own current value via toSessionState()/fromSessionState()", () => {
        const pool = new AccumulatingJackpotPool("grand", 1000);
        pool.contribute(750);

        const captured = pool.toSessionState();
        expect(captured).toEqual({value: 1750});

        const restored = new AccumulatingJackpotPool("grand", 1000);
        restored.fromSessionState(captured);

        expect(restored.getValue()).toBe(1750);
    });

    it("rejects a negative seed value", () => {
        expect(() => new AccumulatingJackpotPool("grand", -1)).toThrow(/finite number >= 0/);
    });

    it("rejects a non-finite seed value", () => {
        expect(() => new AccumulatingJackpotPool("grand", Infinity)).toThrow(/finite number >= 0/);
        expect(() => new AccumulatingJackpotPool("grand", NaN)).toThrow(/finite number >= 0/);
    });
});
