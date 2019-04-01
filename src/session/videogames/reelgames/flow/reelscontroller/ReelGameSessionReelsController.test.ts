import {ReelGameSessionReelsController} from "./ReelGameSessionReelsController";

describe("ReelGameSessionReelsController", () => {

    describe("transposeMatrix", () => {

        it("reverts rows and cols", () => {
            expect(ReelGameSessionReelsController.transposeMatrix([
                [1, 2, 3, 4],
                [5, 6, 7, 8],
            ])).toEqual([
                [1, 5],
                [2, 6],
                [3, 7],
                [4, 8],
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

    describe("createItemsSequences", () => {
        const availableItems: string[] = [
            "A",
            "K",
            "Q",
            "J",
            "10",
            "9",
        ];

        it("creates an array of shuffled sequences for specified number of reels", () => {
            expect(ReelGameSessionReelsController.createItemsSequences(5, availableItems)).toHaveLength(5);
            expect(ReelGameSessionReelsController.createItemsSequences(3, availableItems)).toHaveLength(3);
            ReelGameSessionReelsController.createItemsSequences(3, availableItems).forEach(curItems => expect(curItems).toHaveLength(availableItems.length));
        });

        it("creates an array of shuffled sequences for specified number of reels and counts of items", () => {
            expect(ReelGameSessionReelsController.createItemsSequences(5, availableItems)).toHaveLength(5);
            expect(ReelGameSessionReelsController.createItemsSequences(3, availableItems)).toHaveLength(3);

            let items = ReelGameSessionReelsController.createItemsSequences(5, availableItems, {
                "0": {
                    "A": 0
                },
                "1": {
                    "A": 0
                },
                "3": {
                    "A": 0
                },
                "4": {
                    "A": 0
                },
            });
            expect(items).toHaveLength(5);

            items.forEach((curItems, i) => {
                if (i === 2) {
                    expect(curItems).toHaveLength(availableItems.length);
                } else {
                    expect(curItems).toHaveLength(availableItems.length - 1);
                }
            });

            const counts = [0, 1, 2, 3, 4].reduce((o, item) => {
                o[item] = {
                    "A": 10,
                    "K": 20,
                    "Q": 30,
                    "J": 40,
                    "10": 50,
                    "9": 60
                };
                return o;
            }, {});
            items = ReelGameSessionReelsController.createItemsSequences(5, availableItems, counts);
            items.forEach((curItems, i) => {
                expect(curItems).toHaveLength(Object.keys(counts[i]).map(key => counts[i][key]).reduce((sum, item) => sum += item, 0));
            });
        })

    });

});
