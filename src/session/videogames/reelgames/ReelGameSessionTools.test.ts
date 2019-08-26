import {ReelGameSessionTools} from "./ReelGameSessionTools";

it("determines on which place a combination of specified items is possible at reel", () => {
    const sequence: string[] = [
        "0",
        "1",
        "2",
        "3",
        "4",
        "5",
        "6",
        "7",
        "8",
        "9",
    ];

    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["3", "4"], 3)).toEqual([2, 3]);
    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["4", "3"], 3)).toEqual([2, 3]);
    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["6", "7", "8"], 3)).toEqual([6]);
    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["8", "7", "6"], 3)).toEqual([6]);
    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["8", "9"], 3)).toEqual([7, 8]);
    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["9", "8"], 3)).toEqual([7, 8]);
    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["9", "8", "7"], 3)).toEqual([7]);
    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["0", "2"], 3)).toEqual([0]);
    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["2", "0"], 3)).toEqual([0]);
    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["4", "6"], 3)).toEqual([4]);
    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["6", "4"], 3)).toEqual([4]);
    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["7", "9"], 3)).toEqual([7]);
    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["9", "7"], 3)).toEqual([7]);

    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["0", "1"], 3)).toEqual([0, 9]);
    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["1", "0"], 3)).toEqual([0, 9]);
    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["0", "9"], 3)).toEqual([8, 9]);
    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["9", "0"], 3)).toEqual([8, 9]);
    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["1", "9"], 3)).toEqual([9]);
    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["9", "1"], 3)).toEqual([9]);
    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["0", "8"], 3)).toEqual([8]);
    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["8", "0"], 3)).toEqual([8]);

    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["9", "8", "7", "6"], 3)).toEqual([]);
    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["0", "3"], 3)).toEqual([]);
    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["3", "0"], 3)).toEqual([]);
    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["3", "7"], 3)).toEqual([]);
    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["7", "3"], 3)).toEqual([]);
    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["9", "6"], 3)).toEqual([]);
    expect(ReelGameSessionTools.findSectorsWithItemsOnSequence(sequence, ["6", "9"], 3)).toEqual([]);
});
