import {AccumulatingJackpotPool, FixedJackpotPool, SingleTierJackpotAwarding} from "pokie";

describe("SingleTierJackpotAwarding", () => {
    it("awards the first configured pool, calling its own award()", () => {
        const first = new FixedJackpotPool("mini", 100);
        const second = new FixedJackpotPool("grand", 5000);
        const awarding = new SingleTierJackpotAwarding<string>();

        const result = awarding.resolveAward([first, second], {bet: 1, stake: 1, symbols: [["J"]]});

        expect(result).toEqual({poolId: "mini", amount: 100, symbolId: undefined});
        expect(first.getValue()).toBe(100); // fixed pool, unaffected by its own award
    });

    it("attributes the award to the configured symbolId when one is supplied", () => {
        const pool = new FixedJackpotPool("mini", 100);
        const awarding = new SingleTierJackpotAwarding<string>("J");

        const result = awarding.resolveAward([pool], {bet: 1, stake: 1, symbols: [["J"]]});

        expect(result.symbolId).toBe("J");
    });

    it("actually drains a growing pool's own accumulated value, not just its seed", () => {
        const pool = new AccumulatingJackpotPool("grand", 1000);
        pool.contribute(250);
        const awarding = new SingleTierJackpotAwarding<string>();

        const result = awarding.resolveAward([pool], {bet: 1, stake: 1, symbols: [["J"]]});

        expect(result.amount).toBe(1250);
        expect(pool.getValue()).toBe(1000); // reset back to seed by the pool's own award()
    });
});
