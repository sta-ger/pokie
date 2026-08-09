import {accumulateUniqueGridWeights} from "../../../../src/weightedoutcome/generate/internal/accumulateUniqueGridWeights.js";
import {WeightedOutcomeLibraryGenerationError} from "../../../../src/weightedoutcome/generate/WeightedOutcomeLibraryGenerationError.js";

// A single reel window of one position -- every raw tuple resolves to the identical trivial grid [["A"]], so
// these tests exercise only the periodic heap-usage check itself (see accumulateUniqueGridWeights's own doc
// comment on why this exists: a wide/many-reel real game can retain close to one Map entry per raw combination,
// which this fixture deliberately does NOT reproduce -- these tests fake heap pressure via getHeapUsedBytes
// instead of actually allocating gigabytes).
const reelWindows: string[][][] = [[["A"]]];

function *tuples(count: number): Generator<{tuple: number[]; rawIndex: bigint}> {
    for (let index = 0; index < count; index++) {
        yield {tuple: [0], rawIndex: BigInt(index)};
    }
}

describe("accumulateUniqueGridWeights heap safety guard", () => {
    it("does nothing when heapUsedLimitBytes/getHeapUsedBytes are both omitted, even for a run long enough to check", async () => {
        const {processedRawCount} = await accumulateUniqueGridWeights(reelWindows, tuples(12_000), BigInt(12_000), {
            sourceEnumerationId: "src",
        });

        expect(processedRawCount).toBe(BigInt(12_000));
    });

    it("completes normally when heap usage stays under the limit throughout", async () => {
        const getHeapUsedBytes = jest.fn(() => 10);

        const {processedRawCount} = await accumulateUniqueGridWeights(reelWindows, tuples(12_000), BigInt(12_000), {
            sourceEnumerationId: "src",
            heapUsedLimitBytes: 1_000,
            getHeapUsedBytes,
        });

        expect(processedRawCount).toBe(BigInt(12_000));
        expect(getHeapUsedBytes.mock.calls.length).toBeGreaterThan(0);
    });

    it("fails closed with a WeightedOutcomeLibraryGenerationError as soon as heap usage crosses the limit", async () => {
        const getHeapUsedBytes = jest.fn(() => 2_000);
        expect.assertions(4);

        try {
            await accumulateUniqueGridWeights(reelWindows, tuples(12_000), BigInt(12_000), {
                sourceEnumerationId: "src",
                heapUsedLimitBytes: 1_000,
                getHeapUsedBytes,
            });
        } catch (error) {
            expect(error).toBeInstanceOf(WeightedOutcomeLibraryGenerationError);
            expect((error as WeightedOutcomeLibraryGenerationError).getCode()).toBe("weighted-outcome-library-generation-memory-exceeded");
            expect((error as Error).message).toMatch(/5000\/12000 raw combinations/);
            expect((error as Error).message).toMatch(/--bounded --sample-size/);
        }
    });

    it("never checks heap usage on the initial checkpoint-seeded count alone -- only once a fresh periodic boundary is crossed", async () => {
        // initialProcessedRawCount is itself already a multiple of the internal yield cadence (5000), but the
        // guard is only ever consulted from inside the loop as combinations are actually processed, not once
        // up front against a resumed starting point -- so a getHeapUsedBytes that would fail immediately must
        // not fire until this call itself has processed enough further combinations to hit the next boundary.
        const getHeapUsedBytes = jest.fn(() => 2_000);

        await expect(
            accumulateUniqueGridWeights(reelWindows, tuples(4_999), BigInt(15_000), {
                sourceEnumerationId: "src",
                heapUsedLimitBytes: 1_000,
                getHeapUsedBytes,
                initialProcessedRawCount: BigInt(5_000),
            }),
        ).resolves.toEqual({grids: expect.any(Map), processedRawCount: BigInt(9_999)});
        expect(getHeapUsedBytes).not.toHaveBeenCalled();
    });
});
