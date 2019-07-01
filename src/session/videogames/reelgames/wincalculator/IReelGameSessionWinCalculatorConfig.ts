export interface IReelGameSessionWinCalculatorConfig {

    paytable: {
        [bet: number]: {
            [itemId: string]: {
                [times: number]: number,
            },
        },
    };

    wildItemId: string;

    scatters: any[][];

    reelsNumber: number;

    reelsItemsNumber: number;

    linesDirections: {};

    wildsMultipliers: {
        [wildsNum: number]: number,
    };

}
