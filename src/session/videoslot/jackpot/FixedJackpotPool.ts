import type {JackpotPoolRepresenting} from "./JackpotPoolRepresenting.js";

// The simplest jackpot source: a constant, pre-configured award amount that never grows and never resets —
// contribute() is a no-op, award() always returns the same fixed amount. Models a fixed/non-progressive
// jackpot tier (e.g. a flat "mini" prize).
export class FixedJackpotPool implements JackpotPoolRepresenting {
    private readonly id: string;
    private readonly amount: number;

    constructor(id: string, amount: number) {
        if (!Number.isFinite(amount) || amount < 0) {
            throw new Error(`FixedJackpotPool requires amount to be a finite number >= 0, got ${String(amount)}.`);
        }
        this.id = id;
        this.amount = amount;
    }

    public getId(): string {
        return this.id;
    }

    public getValue(): number {
        return this.amount;
    }

    public contribute(_amount: number): void {
        /* a fixed jackpot never grows */
    }

    public award(): number {
        return this.amount;
    }
}
