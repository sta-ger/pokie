import {ReelGameSessionReelsController} from "./ReelGameSessionReelsController";
import {ReelGameSessionConfig} from "../ReelGameSessionConfig";

describe("ReelGameSessionReelsController", () => {
    const availableItems: string[] = [
        "A",
        "K",
        "Q",
        "J",
        "10",
        "9",
    ];

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

        it("creates shuffled sequence of specified items", () => {
            expect(ReelGameSessionReelsController.createItemsSequence(availableItems))
                .toHaveLength(availableItems.length);
        });

        it("creates shuffled sequence of specified items and counts of items", () => {
            expect(ReelGameSessionReelsController.createItemsSequence(availableItems, {
                A: 2,
            })).toHaveLength(availableItems.length + 1);
            expect(ReelGameSessionReelsController.createItemsSequence(availableItems, {
                A: 0,
            })).toHaveLength(availableItems.length - 1);

            const counts: { [itemId: string]: number } = {
                A: 10,
                K: 20,
                Q: 30,
                J: 40,
                10: 50,
                9: 60,
            };
            expect(ReelGameSessionReelsController.createItemsSequence(availableItems, counts))
                .toHaveLength(Object.keys(counts)
                    .map((key) => counts[key])
                    .reduce((sum, item) => sum + item, 0));
            expect(ReelGameSessionReelsController.createItemsSequence(availableItems, 10))
                .toHaveLength(10 * availableItems.length);
        });

    });

    describe("createItemsSequences", () => {

        it("creates an array of shuffled sequences for specified number of reels", () => {
            expect(ReelGameSessionReelsController.createItemsSequences(5, availableItems)).toHaveLength(5);
            expect(ReelGameSessionReelsController.createItemsSequences(3, availableItems)).toHaveLength(3);
            ReelGameSessionReelsController.createItemsSequences(3, availableItems).forEach(
                (curItems) => expect(curItems).toHaveLength(availableItems.length),
            );
        });

        it("creates an array of shuffled sequences for specified number of reels and counts of items", () => {
            expect(ReelGameSessionReelsController.createItemsSequences(5, availableItems)).toHaveLength(5);
            expect(ReelGameSessionReelsController.createItemsSequences(3, availableItems)).toHaveLength(3);

            let items = ReelGameSessionReelsController.createItemsSequences(5, availableItems, {
                0: {
                    A: 0,
                },
                1: {
                    A: 0,
                },
                3: {
                    A: 0,
                },
                4: {
                    A: 0,
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

            const counts: { [reelId: string]: { [itemId: string]: number } } = [0, 1, 2, 3, 4]
                .reduce((o: { [reelId: string]: { [itemId: string]: number } }, item) => {
                o[item] = {
                    A: 10,
                    K: 20,
                    Q: 30,
                    J: 40,
                    10: 50,
                    9: 60,
                };
                return o;
            }, {});
            items = ReelGameSessionReelsController.createItemsSequences(5, availableItems, counts);
            items.forEach((curItems, i) => {
                expect(curItems).toHaveLength(Object.keys(counts[i])
                        .map((key) => counts[i][key])
                        .reduce((sum, item) => sum + item, 0),
                );
            });

            items = ReelGameSessionReelsController.createItemsSequences(5, availableItems, 10);
            items.forEach((curItems) => {
                expect(curItems).toHaveLength(availableItems.length * 10);
            });
        });

    });

    const sequences = ReelGameSessionReelsController.createItemsSequences(5, availableItems, 10);
    sequences[2] = sequences[2].reduce((arr: string[], item: string) => {
        // Remove symbol "A" from third reel
        if (item !== "A") {
            arr.push(item);
        }
        return arr;
    }, []);
    const conf = new ReelGameSessionConfig(5, 3);
    conf.availableItems = availableItems;
    conf.reelsItemsSequences = sequences;
    const reelsController = new ReelGameSessionReelsController(conf);

    describe("getRandomItem", () => {

        it("returns any of available items", () => {
            for (let i = 0; i <  5; i++) {
                // For each reel
                for (let j = 0; j < 1000; j++) {
                    // Check is returned item one of available items
                    const item = reelsController.getRandomItem(i);
                    expect(availableItems.indexOf(item)).toBeGreaterThanOrEqual(0);
                    if (i === 2) {
                        // and is not equal to symbol "A" removed from third reel's sequence
                        expect(item).not.toBe("A");
                    }
                }
            }
        });

    });

    describe("getRandomReelItems", () => {

        it("returns fragment of visible symbols from random position at reel's sequence", () => {
            for (let i = 0; i <  5; i++) {
                // For each reel
                for (let j = 0; j < 1000; j++) {
                    const items = reelsController.getRandomReelItems(i);
                    expect(items).toHaveLength(3);
                    items.forEach((item) => {
                        // Check is returned item one of available items
                        expect(availableItems.indexOf(item)).toBeGreaterThanOrEqual(0);
                        if (i === 2) {
                            // and is not equal to symbol "A" removed from third reel's sequence
                            expect(item).not.toBe("A");
                        }
                    });
                }
            }

        });

    });

    describe("getRandomItemsCombination", () => {

        it("returns a random reels items combinations", () => {
            const items = reelsController.getRandomItemsCombination();
            expect(items).toHaveLength(5);
            for (let i = 0; i <  5; i++) {
                // For each reel
                for (let j = 0; j < 1000; j++) {
                    expect(items[i]).toHaveLength(3);
                    items[i].forEach((item) => {
                        // Check is returned item one of available items
                        expect(availableItems.indexOf(item)).toBeGreaterThanOrEqual(0);
                        if (i === 2) {
                            // and is not equal to symbol "A" removed from third reel's sequence
                            expect(item).not.toBe("A");
                        }
                    });
                }
            }

        });

    });

});
