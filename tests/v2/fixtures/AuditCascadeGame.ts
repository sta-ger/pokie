import * as api from "@fromstan/pokie";
export function auditCascadeGame(onCalculate: () => void, options: api.CascadeResolverOptions = {}): api.PokieGame {
    const config = new api.VideoSlotConfig();
    config.setReelsNumber(3);
    config.setReelsSymbolsNumber(1);
    config.setAvailableSymbols(["A", "B"]);
    config.setScatterSymbols([]);
    config.setWildSymbols([]);
    config.setAvailableBets([1]);
    config.setBet(1);
    config.setSymbolsSequences(Array.from({length: 3}, () => new api.SymbolsSequence().fromArray(["A"])));
    config.setLinesDefinitions(new api.CustomLinesDefinitions().fromMap({line: [0, 0, 0]}));
    const paytable = new api.Paytable<string>([1], ["A", "B"]);
    paytable.setPayoutForSymbol("A", 3, 2);
    paytable.setPayoutForSymbol("B", 3, 0);
    config.setPaytable(paytable);
    class CascadeSession extends api.AbstractVideoSlotSessionDecorator implements api.CascadeResultProviding {
        private result?: api.CascadeResult;
        private win = 0;
        public getCascadeResult(): api.CascadeResult {
            if (!this.result) throw new Error("No cascade calculated");
            return this.result;
        }
        public override getSymbolsCombination() {
            return this.result ? new api.SymbolsCombination().fromMatrix(this.result.getFinalScreen()) : this.baseSession.getSymbolsCombination();
        }
        public override getWinAmount(): number {
            return this.win;
        }
        public getStakeAmount(): number {
            return this.getBet();
        }
        public override play(): void {
            onCalculate();
            const before = this.getCreditsAmount();
            this.baseSession.play();
            this.result = new api.CascadingSpinResolver(new api.VideoSlotWinCalculator(config).getWinEvaluationPipeline(), config,
                {getRefillSymbols: (_screen, _removed, index) => Array.from({length: 3}, () => [index === 0 ? "A" : "B"])}, undefined, options).resolve(this.baseSession.getSymbolsCombination().toMatrix(), this.getBet());
            this.win = this.result.getTotalCascadeWin();
            this.setCreditsAmount(before - this.getBet() + this.win);
        }
        public getSessionStateSchema(): api.SessionStateSchema {
            return {kind: "custom"};
        }
        public isSessionStateRestorable(): boolean {
            return true;
        }
        public validateSessionState(value: unknown): void {
            const state = value as {base: unknown; win: number};
            if (!state || !Number.isFinite(state.win) || state.win < 0) throw new Error("Invalid cascade continuation");
            (this.baseSession as api.VideoSlotSession).validateSessionState(state.base);
        }
        public toSessionState() {
            return {base: (this.baseSession as api.VideoSlotSession).toSessionState(), win: this.win};
        }
        public fromSessionState(value: unknown): this {
            this.validateSessionState(value);
            const state = value as ReturnType<CascadeSession["toSessionState"]>;
            (this.baseSession as api.VideoSlotSession).fromSessionState(state.base);
            this.win = state.win;
            return this;
        }
    }
    return {getConfigHash: () => `cascade-model-v1:${JSON.stringify(options)}`, getManifest: () => ({id: "cascade-delivery", name: "Cascade", version: "1"}), supportsLogicalRoundDelivery: () => true,
        getSessionStateSchema: () => ({kind: "custom"}), getSessionCommandCapabilities: () => ({bets: [1]}),
        validateSessionState: value => {
            const state = value as {base: unknown; win: number};
            if (!state || !Number.isFinite(state.win) || state.win < 0) throw new Error("Invalid cascade continuation");
            api.validateExecutableState(state.base, {kind: "seeded-video-slot", reels: 3, symbols: ["A", "B"]});
        },
        createSession: context => new CascadeSession(new api.VideoSlotSession(config, new api.SymbolsCombinationsGenerator(config, new api.SeededRandomNumberGenerator(context?.seed ?? 7)))),
        getSessionSerializer: () => ({getInitialData: session => new api.VideoSlotSessionSerializer().getInitialData(session as api.VideoSlotSessionHandling),
            getRoundData: session => new api.CascadeSessionSerializer().getRoundData(session as CascadeSession)})};
}

