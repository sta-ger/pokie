import {ReelGameSession} from "./session/videogames/reelgames/ReelGameSession";
import {ReelGameSessionParameters} from "./session/videogames/reelgames/ReelGameSessionParameters";
import {IReelGameSession} from "./session/videogames/reelgames/IReelGameSession";
import {GameSessionParameters} from "./session/GameSessionParameters";
import {IGameSessionModel} from "./session/IGameSessionModel";

export class Slotify {

    public static createReelGameSession(config?: IReelGameSessionConfig): IReelGameSession {
        let sessionClass;

        if (config && config.customSessionClass) {
            sessionClass = ReelGameSession;
        } else  {
            sessionClass = class Session extends ReelGameSession {

                constructor(){
                    super();
                }

                protected initializeGlobalSessionParameters(): void {
                    super.initializeGlobalSessionParameters();
                    if (config) {
                        if (config.availableBets) {
                            GameSessionParameters.availableBets = config.availableBets;
                        }
                        if (config.paytable) {
                            ReelGameSessionParameters.paytable = config.paytable;
                        }
                        if (config.availableItems) {
                            ReelGameSessionParameters.availableItems = config.availableItems;
                        }
                        if (config.wildItemId) {
                            ReelGameSessionParameters.wildItemId = config.wildItemId;
                        }
                        if (config.scatters) {
                            ReelGameSessionParameters.scatters = config.scatters;
                        }
                        if (config.reelsNumber) {
                            ReelGameSessionParameters.reelsNumber = config.reelsNumber;
                        }
                        if (config.reelsItemsNumber) {
                            ReelGameSessionParameters.reelsItemsNumber = config.reelsItemsNumber;
                        }
                        if (config.reelsItemsSequences) {
                            ReelGameSessionParameters.reelsItemsSequences = config.reelsItemsSequences;
                        }
                        if (config.linesDirections) {
                            ReelGameSessionParameters.linesDirections = config.linesDirections;
                        }
                    }
                }
    
                protected createSessionModel(): IGameSessionModel {
                    let r: IGameSessionModel;
                    r = super.createSessionModel();
                    if (config.creditsAmount !== undefined) {
                        r.credits = config.creditsAmount;
                    }
                    return r;
                }
            }
        }
        return new sessionClass() as IReelGameSession;
    }

}

export interface IReelGameSessionConfig extends IGameSessionConfig {

    paytable?: {
        [bet: number]: {
            [itemId: string]: {
                [times: number]: number
            }
        }
    };

    availableItems?: string[];

    wildItemId?: string;

    scatters?: any[][];

    reelsNumber?: number;

    reelsItemsNumber?: number;
    
    reelsItemsSequences?: string[][];

    linesDirections?: {};

}

export interface IGameSessionConfig {

    customSessionClass?: any;

    availableBets?: number[];
    
    creditsAmount?: number;

}