export class ReelGameSessionParameters {
    
    public static availableItems: string[];
    
    public static wildItemId: string;
    
    public static scatters: any[][];
    
    public static reelsNumber: number;
    
    public static reelsItemsNumber: number;
    
    public static reelsItemsSequences: string[][];
    
    public static linesDirections: {};
    
    public static paytable: {
        [bet: number]: {
            [itemId: string]: {
                [times: number]: number
            }
        }
    };
    
}