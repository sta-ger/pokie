import {ReelGameSessionReelsController} from "./ReelGameSessionReelsController";

describe("ReelGameSessionReelsController", () => {

    describe("transposeMatrix", () => {

        it("reverts rows and cols", () => {
            expect(ReelGameSessionReelsController.transposeMatrix([
                [1,2,3,4],
                [5,6,7,8],
            ])).toEqual([
                [1,5],
                [2,6],
                [3,7],
                [4,8],
            ]);
        });

    });

    describe("createItemsSequence", () => {
        const availableItems: string[] = [
            "A",
            "K",
            "Q",
            "J",
            "10",
            "9",
        ];

        it("creates shuffled sequence of specified items", () => {
            expect(ReelGameSessionReelsController.createItemsSequence(availableItems)).toHaveLength(availableItems.length);
        });

        it("creates shuffled sequence of specified items and counts of items", () => {
            expect(ReelGameSessionReelsController.createItemsSequence(availableItems, {
                "A": 2
            })).toHaveLength(availableItems.length + 1);
            expect(ReelGameSessionReelsController.createItemsSequence(availableItems, {
                "A": 0
            })).toHaveLength(availableItems.length - 1);

            const counts = {
                "A": 10,
                "K": 20,
                "Q": 30,
                "J": 40,
                "10": 50,
                "9": 60
            };
            expect(ReelGameSessionReelsController.createItemsSequence(availableItems, counts)).toHaveLength(Object.keys(counts).map(key => counts[key]).reduce((sum, item) => sum += item, 0));
        });

    });

});
