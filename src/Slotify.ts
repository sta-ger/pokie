import {ReelGameSession} from "./session/videogames/reelgames/ReelGameSession";
import {ReelGameSessionParameters} from "./session/videogames/reelgames/ReelGameSessionParameters";
import {IReelGameSession} from "./session/videogames/reelgames/IReelGameSession";
import {GameSessionParameters} from "./session/GameSessionParameters";
import {IGameSessionModel} from "./session/IGameSessionModel";
import {IReelGameSessionConfig} from "./session/videogames/reelgames/IReelGameSessionConfig";

export class Slotify {
    
    public static createReelGameSession(config?: IReelGameSessionConfig): IReelGameSession {
        let baseSessionClass;
        let r;
        if (config && config.customSessionClass) {
            baseSessionClass = config.customSessionClass;
        } else {
            baseSessionClass = ReelGameSession;
        }
        r = new class Session extends baseSessionClass {
            
            constructor() {
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
                if (config && config.creditsAmount !== undefined) {
                    r.credits = config.creditsAmount;
                }
                return r;
            }
        };
        
        return r;
    }
    
}



