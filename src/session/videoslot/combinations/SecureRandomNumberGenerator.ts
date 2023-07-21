import {RandomNumberGenerating} from "pokie";
import crypto from "crypto";

export class SecureRandomNumberGenerator implements RandomNumberGenerating {
    public getRandomInt(min: number, max: number): number {
        return crypto.randomInt(min, max);
    }
}
