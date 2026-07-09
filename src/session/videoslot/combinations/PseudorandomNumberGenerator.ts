import type {RandomNumberGenerating} from "./RandomNumberGenerating.js";

export class PseudorandomNumberGenerator implements RandomNumberGenerating {
    public getRandomInt(min: number, max: number): number {
        return Math.floor(min + Math.random() * (max - min));
    }
}
