import {GameSession, GameSessionConfig, SeededRandomNumberGenerator, type PokieGame, type SessionStateSchema} from "@fromstan/pokie";

type Snapshot = {rng: number; round: number; free: number; mode: string; win: number};
function validate(state: unknown): asserts state is Snapshot {
    const value = state as Snapshot;
    if (!value || !Number.isSafeInteger(value.rng) || value.rng < 0 || value.rng > 0xffffffff ||
        !Number.isSafeInteger(value.round) || value.round < 0 || !Number.isSafeInteger(value.free) || value.free < 0 ||
        !["base", "double"].includes(value.mode) || !Number.isFinite(value.win) || value.win < 0) throw new Error("Invalid reference game snapshot.");
}

/** Small real stateful engine, exercising seeded continuation, selections and free-round progress. */
export function transactionalRoundGame(onCalculate?: () => void, failure?: "calculation" | "capture" | "serialization"): PokieGame {
    class ReferenceSession extends GameSession {
        private readonly rng: SeededRandomNumberGenerator;
        private round = 0;
        private free = 0;
        private mode = "base";
        private win = 0;
        constructor(seed: string | number) {
            const config = new GameSessionConfig();
            config.setAvailableBets([0.05, 7.5, 1e-7]);
            config.setBet(0.05);
            super(config);
            this.rng = new SeededRandomNumberGenerator(seed);
        }
        public override getSessionStateSchema(): SessionStateSchema {
            return {kind: "custom"};
        }
        public override isSessionStateRestorable(): boolean {
            return true;
        }
        public override validateSessionState(state: unknown): void {
            validate(state);
        }
        public override toSessionState(): Snapshot {
            if (this.round > 0 && failure === "capture") throw new Error("capture failure");
            return {rng: this.rng.toSessionState(), round: this.round, free: this.free, mode: this.mode, win: this.win};
        }
        public override fromSessionState(state: unknown): this {
            validate(state);
            this.rng.fromSessionState(state.rng);
            this.round = state.round;
            this.free = state.free;
            this.mode = state.mode;
            this.win = state.win;
            return this;
        }
        public getAvailableBetModeIds(): string[] {
            return ["base", "double"];
        }
        public getBetModeId(): string {
            return this.mode;
        }
        public setBetMode(mode: string): void {
            this.mode = mode;
        }
        public hasPendingLogicalRound(): boolean {
            return this.free > 0; 
        }
        public getStakeAmount(): number {
            return this.free > 0 ? 0 : this.getBet() * (this.mode === "double" ? 2 : 1);
        }
        public override canPlayNextGame(): boolean {
            return this.getCreditsAmount() >= this.getStakeAmount();
        }
        public override getWinAmount(): number {
            return this.win;
        }
        public override play(): void {
            onCalculate?.();
            const stake = this.getStakeAmount();
            this.win = this.rng.getRandomInt(0, 4) * this.getBet();
            this.round++;
            if (this.free > 0) this.free--;
            else this.free = this.round % 3 === 1 ? 2 : 0;
            this.setCreditsAmount(this.getCreditsAmount() - stake + this.win);
            if (failure === "calculation") throw new Error("calculation failure");
        }
    }
    return {
        supportsLogicalRoundDelivery: () => true,
        getManifest: () => ({id: "reference-round", name: "Reference round", version: "1"}),
        getSessionStateSchema: () => ({kind: "custom"}),
        getSessionCommandCapabilities: () => ({bets: [0.05, 7.5, 1e-7], modes: ["base", "double"]}),
        validateSessionState: validate,
        getSessionSerializer: () => ({
            getInitialData: session => ({bet: session.getBet(), credits: session.getCreditsAmount(), availableBets: session.getAvailableBets()}),
            getRoundData: session => ({bet: session.getBet(), credits: session.getCreditsAmount(), win: session.getWinAmount(), ...(failure === "serialization" ? {invalid: () => 1} : {})}),
            getInitialDebugData: () => ({secret: "debug-only"}),
            getRoundDebugData: () => ({secret: "debug-only"}),
        }),
        createSession: context => new ReferenceSession(context?.seed ?? 7),
    };
}
