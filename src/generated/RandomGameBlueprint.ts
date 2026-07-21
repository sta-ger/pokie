import type {GameBlueprint} from "./GameBlueprint.js";

export type RandomGameBlueprint = {
    blueprint: GameBlueprint;
    // The seed actually used — echoes back the caller's own seed unchanged, or the one this call
    // minted for itself when none was given, so an unseeded run can still be reproduced afterward.
    seed: number;
};
