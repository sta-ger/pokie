export class ReelGameSessionParameters {
    
    public static availableItems: string[];
    
    public static wildItemId: string;
    
    public static scatters: any[][];
    
    public static reelsNumber: number = 5;
    
    public static reelsItemsNumber: number = 3;
    
    public static reelsItemsSequences: string[][];
    
    public static linesDirections: {

    };
    
    public static paytable: {
        [bet: number]: {
            [itemId: string]: {
                [times: number]: number
            }
        }
    };
    
}