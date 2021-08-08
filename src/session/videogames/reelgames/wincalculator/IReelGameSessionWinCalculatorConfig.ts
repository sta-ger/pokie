export interface IReelGameSessionWinCalculatorConfig {

    paytable: {
        [bet: number]: {
            [itemId: string]: {
                [times: number]: number,
            },
        },
    };

    wildItemId: string;

    scatters: [string, number][];

    reelsNumber: number;

    reelsItemsNumber: number;

    linesDirections: { [lineId: string]: number[] };

    wildsMultipliers: {
        [wildsNum: number]: number,
    };

}
