import type {PokieGameContext} from "../../gamepackage/PokieGameContext.js";

export type PokieSessionState = {
    context?: PokieGameContext;
    bet: number;
    win: number;
    screen?: unknown[][];
};
