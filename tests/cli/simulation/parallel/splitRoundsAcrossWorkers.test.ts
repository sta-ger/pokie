import {splitRoundsAcrossWorkers} from "../../../../cli/simulation/parallel/splitRoundsAcrossWorkers.js";

describe("splitRoundsAcrossWorkers", () => {
    test("splits evenly when rounds is a multiple of workers", () => {
        expect(splitRoundsAcrossWorkers(100, 4)).toEqual([25, 25, 25, 25]);
    });

    test("distributes the remainder to the first workers, one extra round each", () => {
        expect(splitRoundsAcrossWorkers(10, 3)).toEqual([4, 3, 3]);
        expect(splitRoundsAcrossWorkers(7, 4)).toEqual([2, 2, 2, 1]);
    });

    test("rounds less than workers: the first `rounds` workers get exactly 1, the rest get 0", () => {
        expect(splitRoundsAcrossWorkers(3, 5)).toEqual([1, 1, 1, 0, 0]);
    });

    test("workers=1 gives the whole round count to the single share", () => {
        expect(splitRoundsAcrossWorkers(12345, 1)).toEqual([12345]);
    });

    test("the shares always sum back to exactly the requested rounds", () => {
        const cases: Array<[number, number]> = [
            [1000, 3],
            [1, 4],
            [0, 4],
            [999999, 7],
            [17, 17],
        ];
        for (const [rounds, workers] of cases) {
            const shares = splitRoundsAcrossWorkers(rounds, workers);
            expect(shares).toHaveLength(workers);
            expect(shares.reduce((sum, share) => sum + share, 0)).toBe(rounds);
        }
    });

    test("rounds=0 gives every worker a zero share", () => {
        expect(splitRoundsAcrossWorkers(0, 4)).toEqual([0, 0, 0, 0]);
    });
});
