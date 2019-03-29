import {IGameSessionConfig} from "./IGameSessionConfig";

export class GameSessionConfig implements IGameSessionConfig {

    public availableBets?: number[] = [
        1, 2, 3, 4, 5, 10, 20, 30, 40, 50, 100
    ];

    public creditsAmount?: number = 1000;

    public bet?: number = this.availableBets[0];

}