import {IReelGameSessionConfig} from "./IReelGameSessionConfig";
import {GameSessionConfig} from "../../GameSessionConfig";

export class ReelGameSessionConfig extends GameSessionConfig implements IReelGameSessionConfig {

    public paytable?: {
        [bet: number]: {
            [itemId: string]: {
                [times: number]: number
            }
        }
    };

    public availableItems?: string[];

    public wildItemId?: string;

    public scatters?: any[][];

    public reelsNumber?: number;

    public reelsItemsNumber?: number;

    public reelsItemsSequences?: string[][];

    public linesDirections?: {};

    constructor(reelsNumber: number = 5, reelsItemsNumber: number = 3) {
        super();

        this.availableItems = [
            "A",
            "K",
            "Q",
            "J",
            "10",
            "9",
            "W",
            "S"
        ];

        this.wildItemId = "W";

        this.scatters = [
            ["S", 3]
        ];

        this.reelsNumber = reelsNumber;
        this.reelsItemsNumber = reelsItemsNumber;

        this.linesDirections = [];
        for (let i: number = 0; i < this.reelsItemsNumber; i++) {
            for (let j: number = 0; j < this.reelsNumber; j++) {
                if (!this.linesDirections[i]) {
                    this.linesDirections[i] = [];
                }
                this.linesDirections[i].push(i);
            }
        }

        this.reelsItemsSequences = [];
        for (let i = 0; i < reelsNumber; i++) {
            this.reelsItemsSequences[i] = this.availableItems.reduce(ob => [...ob, ...this.availableItems], this.availableItems).sort(() => Math.random() - 0.5);
        }
    }

}
