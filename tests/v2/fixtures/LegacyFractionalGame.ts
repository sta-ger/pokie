import {GameSession, GameSessionConfig, type PokieGame, type SessionStateSchema} from "@fromstan/pokie";

/** Complete deterministic custom codec, deliberately without an exact payout provider. */
class LegacyFractionalSession extends GameSession {
    private rounds = 0;

    constructor(private readonly adjustment: number, credits: number) {
        const config = new GameSessionConfig();
        config.setAvailableBets([1]);
        config.setBet(1);
        config.setCreditsAmount(credits);
        super(config);
    }

    public override play(): void {
        if (!this.canPlayNextGame()) return;
        super.play();
        this.setCreditsAmount(this.getCreditsAmount() + this.adjustment);
        this.rounds++;
    }

    public override getWinAmount(): number {
        return this.rounds ? Math.max(0, this.adjustment) : 0;
    }

    public override getSessionStateSchema(): SessionStateSchema {
        return {kind: "custom"};
    }

    public override isSessionStateRestorable(): boolean {
        return true;
    }

    public override toSessionState(): {rounds: number} {
        return {rounds: this.rounds};
    }

    public override validateSessionState(state: unknown): void {
        if (!state || typeof state !== "object" || Array.isArray(state) ||
            Object.keys(state).length !== 1 || !("rounds" in state) ||
            !Number.isSafeInteger(state.rounds) || (state.rounds as number) < 0) throw new Error("Invalid legacy round count.");
    }

    public override fromSessionState(state: unknown): this {
        this.validateSessionState(state);
        this.rounds = (state as {rounds: number}).rounds;
        return this;
    }
}

export function legacyFractionalGame(adjustment = 0.1, credits = 1): PokieGame {
    return {
        getInfo: () => ({id: "legacy-fractional", name: "Legacy fractional", version: "1"}),
        getConfigHash: () => `legacy-fractional:${adjustment}:${credits}`,
        getSessionStateSchema: () => ({kind: "custom"}),
        getSessionCommandCapabilities: () => ({bets: [1]}),
        validateSessionState: state => new LegacyFractionalSession(adjustment, credits).validateSessionState(state),
        createSession: () => new LegacyFractionalSession(adjustment, credits),
    };
}
