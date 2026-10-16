import type {RandomNumberGenerating} from "../RandomNumberGenerating.js";

/** The outer checkpoint owns the actual host RNG. This codec counts consumed
 * host draws, without inventing a seeded stream or retaining a tape/history.
 */
export class PortableRandomNumberGenerator implements RandomNumberGenerating {
    private draws = 0;
    private readonly entropy: () => number;
    private active: boolean;
    constructor(entropy: () => number, active = true) {
        this.entropy = entropy;
        this.active = active;
    }
    public activate(): void {
        this.active = true;
    }
    public getRandomInt(min: number, max: number): number {
        // Construction during restore makes a bounded display placeholder. It is
        // neither an initialization draw nor a replay of the consumed prefix.
        if (!this.active) return min;
        if (!Number.isSafeInteger(this.draws + 1)) throw new Error("Portable RNG draw cursor exhausted.");
        const draw = this.entropy();
        if (!Number.isFinite(draw) || draw < 0 || draw >= 1) throw new Error("Host RNG must return a finite value in [0, 1).");
        this.draws++;
        return min + Math.floor(draw * (max - min));
    }
    public getRandomStateCodec(): "portable-host" {
        return "portable-host";
    }
    public toSessionState(): number {
        return this.draws;
    }
    public fromSessionState(value: number): this {
        if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid portable RNG draw cursor.");
        this.draws = value;
        return this;
    }
}
