import type {PokieGame} from "../gamepackage/PokieGame.js";

export type ReplayRecordingOptions = {
    game: PokieGame;
    seed?: string;
    round: number;
};
