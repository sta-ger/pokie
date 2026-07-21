import type {BuildableFromSessionState} from "../../BuildableFromSessionState.js";
import type {ConvertableToSessionState} from "../../ConvertableToSessionState.js";
import type {JackpotPoolRepresenting} from "./JackpotPoolRepresenting.js";

// A jackpot pool that grows via contribute() and resets to its own seed value on award() — the one class
// that serves as both a "local" jackpot (grows for, and is awardable to, a single session — construct one
// fresh per session) and a "progressive" one (grows across many sessions — construct exactly one instance
// and inject the *same* object into every VideoSlotWithJackpotSession that should share it). The class
// itself has no idea which of the two it's being used as; that distinction is entirely a matter of
// deployment/composition, not different code. This package deliberately does not provide real distributed/
// cross-process progressive-jackpot persistence (wallet/operator infrastructure is explicitly out of scope
// for this abstraction) — a truly shared, concurrent-safe progressive pool across separate processes needs
// its own JackpotPoolRepresenting implementation backed by whatever shared store an operator provides.
//
// Implements ConvertableToSessionState<{value: number}>/BuildableFromSessionState<{value: number}> so
// VideoSlotWithJackpotSession's own toSessionState()/fromSessionState() can capture/restore this pool's
// current value across a restore — feature-detected the same way every other optional capability in this
// codebase is. Caution for the "progressive" (shared-instance) usage: if the *same* pool instance is shared
// live across multiple concurrently-running sessions, restoring a stale captured value from one session's
// own serialized state back onto that shared instance will clobber whatever the other sessions have
// contributed since that snapshot was taken — this class makes no attempt to reconcile that, matching this
// package's own "no true cross-store atomicity" stance elsewhere. Safe and correct for the local
// (one-pool-per-session) case, which never shares an instance in the first place.
export class AccumulatingJackpotPool implements JackpotPoolRepresenting, ConvertableToSessionState<{value: number}>, BuildableFromSessionState<{value: number}> {
    private readonly id: string;
    private readonly seedValue: number;
    private value: number;

    constructor(id: string, seedValue: number) {
        if (!Number.isFinite(seedValue) || seedValue < 0) {
            throw new Error(`AccumulatingJackpotPool requires seedValue to be a finite number >= 0, got ${String(seedValue)}.`);
        }
        this.id = id;
        this.seedValue = seedValue;
        this.value = seedValue;
    }

    public getId(): string {
        return this.id;
    }

    public getValue(): number {
        return this.value;
    }

    public contribute(amount: number): void {
        if (amount > 0) {
            this.value += amount;
        }
    }

    public award(): number {
        const awarded = this.value;
        this.value = this.seedValue;
        return awarded;
    }

    public toSessionState(): {value: number} {
        return {value: this.value};
    }

    public fromSessionState(value: {value: number}): this {
        this.value = value.value;
        return this;
    }
}
