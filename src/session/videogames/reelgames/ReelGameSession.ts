import {GameSession} from "../../GameSession";
import {ReelGameSessionParameters} from "./ReelGameSessionParameters";
import {GameSessionParameters} from "../../GameSessionParameters";
import {IReelGameSession} from "./IReelGameSession";
import {IReelGameSessionFlow} from "./flow/IReelGameSessionFlow";

export class ReelGameSession extends GameSession implements IReelGameSession {
    
    protected initializeGlobalSessionParameters(): void {
        let itemId: string;
        let j: number;
        let bet: number;
        let i: number;
        let k: number;
        
        super.initializeGlobalSessionParameters();
    
        ReelGameSessionParameters.reelsNumber = 3;
        ReelGameSessionParameters.reelsItemsNumber = 3;
    
        ReelGameSessionParameters.linesDirections = {
            0: [1, 1, 1],
            1: [0, 0, 0],
            2: [2, 2, 2],
            3: [0, 1, 2],
            4: [2, 1, 0]
        };
    
        ReelGameSessionParameters.availableItems = [
            "0",
            "1",
            "2",
            "3",
            "4",
            "5",
            "6",
            "7",
            "8",
            "9"
        ];
    
        ReelGameSessionParameters.wildItemId = "w";
    
        ReelGameSessionParameters.scatters = undefined;
    
        ReelGameSessionParameters.paytable = {};
        for (i = 0; i < GameSessionParameters.availableBets.length; i++) {
            bet = GameSessionParameters.availableBets[i];
            ReelGameSessionParameters.paytable[bet] = {};
            for (j = 0; j < ReelGameSessionParameters.availableItems.length; j++) {
                itemId = ReelGameSessionParameters.availableItems[j];
                if (itemId !== ReelGameSessionParameters.wildItemId) {
                    ReelGameSessionParameters.paytable[bet][itemId] = {};
                    for (k = 3; k <= ReelGameSessionParameters.reelsNumber; k++) {
                        ReelGameSessionParameters.paytable[bet][itemId][k] = (k - 2) * bet;
                    }
                }
            }
        }
    }
    
    public getReelsItems(): string[][] {
        return (<IReelGameSessionFlow>this._flow).getReelsItems();
    }
    
    public getWinningLines(): {} {
        return (<IReelGameSessionFlow>this._flow).getWinningLines();
    }
    
    public getWinningScatters(): {} {
        return (<IReelGameSessionFlow>this._flow).getWinningScatters();
    }
    
    public getPaytable(): { [p: string]: { [p: number]: number } } {
        return ReelGameSessionParameters.paytable[this._sessionModel.bet];
    }
    
    public getReelsItemsSequences(): string[][] {
        return ReelGameSessionParameters.reelsItemsSequences;
    }
    
    public getReelsItemsNumber(): number {
        return ReelGameSessionParameters.reelsItemsNumber;
    }
    
    public getReelsNumber(): number {
        return ReelGameSessionParameters.reelsNumber;
    }
    
}
