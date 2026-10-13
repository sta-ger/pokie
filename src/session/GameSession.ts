import {VideoSlotConfig} from "./videoslot/VideoSlotConfig.js";
import {VideoSlotWithFreeGamesConfig} from "./videoslot/VideoSlotWithFreeGamesConfig.js";
import type {SessionStateRestoring, SessionStateSchema} from "./SessionStateRestoring.js";
import {GameSessionConfig} from "./GameSessionConfig.js";
import type {GameSessionConfigRepresenting} from "./GameSessionConfigRepresenting.js";
import type {GameSessionHandling} from "./GameSessionHandling.js";
import {NoWinAmount} from "./NoWinAmount.js";
import type {WinAmountDetermining} from "./WinAmountDetermining.js";

export class GameSession implements GameSessionHandling, SessionStateRestoring {
    private readonly config: GameSessionConfigRepresenting;
    private readonly winCalculator: WinAmountDetermining;
    private bet: number;
    private credits: number;

    constructor(
        config: GameSessionConfigRepresenting = new GameSessionConfig(),
        winAmountCalculator: WinAmountDetermining = new NoWinAmount(),
    ) {
        this.config = config;
        this.winCalculator = winAmountCalculator;
        this.bet = this.getInitialBet();
        this.credits = config.getCreditsAmount();
    }

    public getSessionStateSchema(): SessionStateSchema {
        // Subclasses may already own opaque snapshot methods. Only the plain built-in
        // session promises the empty codec; inherited methods do not certify extensions.
        return {kind: this.constructor === GameSession ? "base" : "custom"};
    }

    public usesConfig(config: GameSessionConfigRepresenting): boolean {
        return this.config === config;
    }

    public isSessionStateRestorable(): boolean {
        const resolved = this.config.constructor === GameSessionConfig ||
            ((this.config instanceof VideoSlotConfig || this.config instanceof VideoSlotWithFreeGamesConfig) && this.config.isResolvedForSessionRestoration());
        return this.constructor === GameSession && resolved && this.winCalculator.constructor === NoWinAmount;
    }

    public toSessionState(): unknown {
        return {};
    }

    public validateSessionState(state: unknown): void {
        if (typeof state !== "object" || state === null || Array.isArray(state) || Object.keys(state).length !== 0) throw new Error("Invalid base game state.");
    }

    public fromSessionState(state: unknown): this {
        this.validateSessionState(state);
        return this;
    }

    public getCreditsAmount(): number {
        return this.credits;
    }

    public setCreditsAmount(creditsAmount: number): void {
        this.credits = creditsAmount;
    }

    public getWinAmount(): number {
        return this.winCalculator.getWinAmount();
    }

    public getAvailableBets(): number[] {
        return this.config.getAvailableBets();
    }

    public getBet(): number {
        return this.bet;
    }

    public setBet(bet: number): void {
        if (!this.config.isBetAvailable(bet)) {
            this.bet = this.getAvailableBets()[0];
        } else {
            this.bet = bet;
        }
    }

    public canPlayNextGame(): boolean {
        return this.credits >= this.bet;
    }

    public play(): void {
        if (this.canPlayNextGame()) {
            this.credits -= this.bet;
        }
    }

    private getInitialBet(): number {
        let initialBet: number;
        if (this.config.isBetAvailable(this.config.getBet())) {
            initialBet = this.config.getBet();
        } else {
            initialBet = this.config.getAvailableBets()[0];
        }
        return initialBet;
    }
}
