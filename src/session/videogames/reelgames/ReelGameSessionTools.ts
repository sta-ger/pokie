export class ReelGameSessionTools {

    public static findSectorsWithItemsOnSequence(
        sequence: string[],
        items: string[],
        reelItemsNumber: number,
    ): number[] {
        const r: number[] = [];
        sequence.forEach((item: string, i: number) => {
            let itemsPart: string[] = new Array(reelItemsNumber);
            itemsPart[0] = item;
            for (let j: number = 1; j < itemsPart.length; j++) {
                let nextItem: string;
                if (i + j < sequence.length) {
                    nextItem = sequence[i + j];
                } else {
                    nextItem = sequence[(i + j) - sequence.length];
                }
                itemsPart[j] = nextItem;
            }
            if (items.reduce((f: boolean, item: string) => f && itemsPart.includes(item), true)) {
                r.push(i);
            }
        });
        return r;
    }

}
