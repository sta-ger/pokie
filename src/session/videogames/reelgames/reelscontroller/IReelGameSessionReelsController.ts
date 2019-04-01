export interface IReelGameSessionReelsController {

    getRandomItemsCombination(): string[][];

    getRandomReelItems(reelId: number): string[];

    getRandomItem(x: number): string;

}
