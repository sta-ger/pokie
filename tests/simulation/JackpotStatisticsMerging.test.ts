import {mergeJackpotStatisticsSnapshots, type JackpotStatisticsSnapshot} from "pokie";

describe("mergeJackpotStatisticsSnapshots", () => {
    test("merging into undefined returns the addition unchanged", () => {
        const addition: JackpotStatisticsSnapshot = {
            awardCount: 1,
            totalAwarded: 500,
            totalContributed: 1000,
            pools: {mini: {awardCount: 1, totalAwarded: 500, totalContributed: 1000}},
        };

        expect(mergeJackpotStatisticsSnapshots(undefined, addition)).toEqual(addition);
    });

    test("sums the overall awardCount/totalAwarded/totalContributed across two snapshots", () => {
        const a: JackpotStatisticsSnapshot = {
            awardCount: 2,
            totalAwarded: 800,
            totalContributed: 2000,
            pools: {mini: {awardCount: 2, totalAwarded: 800, totalContributed: 2000}},
        };
        const b: JackpotStatisticsSnapshot = {
            awardCount: 1,
            totalAwarded: 5000,
            totalContributed: 3000,
            pools: {mini: {awardCount: 1, totalAwarded: 5000, totalContributed: 3000}},
        };

        const merged = mergeJackpotStatisticsSnapshots(a, b);

        expect(merged.awardCount).toBe(3);
        expect(merged.totalAwarded).toBe(5800);
        expect(merged.totalContributed).toBe(5000);
    });

    test("sums matching pool ids' own statistics, entry by entry", () => {
        const a: JackpotStatisticsSnapshot = {
            awardCount: 1,
            totalAwarded: 500,
            totalContributed: 1000,
            pools: {
                mini: {awardCount: 1, totalAwarded: 500, totalContributed: 700},
                grand: {awardCount: 0, totalAwarded: 0, totalContributed: 300},
            },
        };
        const b: JackpotStatisticsSnapshot = {
            awardCount: 1,
            totalAwarded: 5000,
            totalContributed: 900,
            pools: {
                mini: {awardCount: 0, totalAwarded: 0, totalContributed: 200},
                grand: {awardCount: 1, totalAwarded: 5000, totalContributed: 700},
            },
        };

        const merged = mergeJackpotStatisticsSnapshots(a, b);

        expect(merged.pools.mini).toEqual({awardCount: 1, totalAwarded: 500, totalContributed: 900});
        expect(merged.pools.grand).toEqual({awardCount: 1, totalAwarded: 5000, totalContributed: 1000});
    });

    test("keeps a pool that only appears in one of the two snapshots unchanged", () => {
        const a: JackpotStatisticsSnapshot = {
            awardCount: 1,
            totalAwarded: 500,
            totalContributed: 1000,
            pools: {mini: {awardCount: 1, totalAwarded: 500, totalContributed: 1000}},
        };
        const b: JackpotStatisticsSnapshot = {
            awardCount: 1,
            totalAwarded: 5000,
            totalContributed: 2000,
            pools: {grand: {awardCount: 1, totalAwarded: 5000, totalContributed: 2000}},
        };

        const merged = mergeJackpotStatisticsSnapshots(a, b);

        expect(merged.pools.mini).toEqual({awardCount: 1, totalAwarded: 500, totalContributed: 1000});
        expect(merged.pools.grand).toEqual({awardCount: 1, totalAwarded: 5000, totalContributed: 2000});
    });

    test("combining three independent workers' worth of snapshots matches one session that saw every round directly", () => {
        const worker1: JackpotStatisticsSnapshot = {
            awardCount: 1,
            totalAwarded: 100,
            totalContributed: 50,
            pools: {mini: {awardCount: 1, totalAwarded: 100, totalContributed: 50}},
        };
        const worker2: JackpotStatisticsSnapshot = {
            awardCount: 0,
            totalAwarded: 0,
            totalContributed: 30,
            pools: {mini: {awardCount: 0, totalAwarded: 0, totalContributed: 30}},
        };
        const worker3: JackpotStatisticsSnapshot = {
            awardCount: 2,
            totalAwarded: 700,
            totalContributed: 20,
            pools: {mini: {awardCount: 2, totalAwarded: 700, totalContributed: 20}},
        };

        const merged = [worker1, worker2, worker3].reduce<JackpotStatisticsSnapshot | undefined>(
            (base, snapshot) => mergeJackpotStatisticsSnapshots(base, snapshot),
            undefined,
        );

        expect(merged).toEqual({
            awardCount: 3,
            totalAwarded: 800,
            totalContributed: 100,
            pools: {mini: {awardCount: 3, totalAwarded: 800, totalContributed: 100}},
        });
    });
});
