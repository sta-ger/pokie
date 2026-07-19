// Thrown by FixedBetModeForNextSimulationRoundSetting when a simulation run is explicitly locked to a
// bet mode (e.g. "pokie sim --mode <id>") but the session doesn't support BetModeSelecting at all --
// either because the game has no configured bet modes, or its createSession() doesn't wrap the
// session in a bet-mode-aware decorator (e.g. VideoSlotWithBetModesSession). A caller explicitly asked
// for a specific bet mode; silently running the plain base game instead, while still labeling the
// resulting report with the requested mode, would report numbers that were never actually measured
// under that mode. Thrown on the very first round, before any round is played, so no partial/misleading
// statistics are ever produced for the request.
export class BetModeSimulationUnsupportedError extends Error {
    private readonly modeId: string;

    constructor(modeId: string) {
        super(
            `Cannot lock this simulation run to bet mode "${modeId}": the session does not support bet mode ` +
                "selection (BetModeSelecting). Either this game has no configured bet modes, or its " +
                "createSession() doesn't wrap the session in a bet-mode-aware decorator " +
                "(e.g. VideoSlotWithBetModesSession).",
        );
        this.name = "BetModeSimulationUnsupportedError";
        this.modeId = modeId;
    }

    public getModeId(): string {
        return this.modeId;
    }
}
