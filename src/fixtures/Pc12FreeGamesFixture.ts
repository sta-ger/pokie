import {VideoSlotWithFreeGamesConfig} from "../session/videoslot/VideoSlotWithFreeGamesConfig.js";
import {VideoSlotWithFreeGamesSession} from "../session/videoslot/VideoSlotWithFreeGamesSession.js";
import {WinningLine} from "../session/videoslot/WinningLine.js";
import type {WinningLineDescribing} from "../session/videoslot/WinningLineDescribing.js";
import {WinningScatter} from "../session/videoslot/WinningScatter.js";
import type {WinningScatterDescribing} from "../session/videoslot/WinningScatterDescribing.js";
import {SeededRandomNumberGenerator} from "../session/videoslot/combinations/SeededRandomNumberGenerator.js";
import type {SymbolsCombinationDescribing} from "../session/videoslot/combinations/SymbolsCombinationDescribing.js";
import {SymbolsCombinationsGenerator} from "../session/videoslot/combinations/SymbolsCombinationsGenerator.js";
import type {SymbolsCombinationsGenerating} from "../session/videoslot/combinations/SymbolsCombinationsGenerating.js";
import {SymbolsSequence} from "../session/videoslot/combinations/SymbolsSequence.js";
import type {SymbolsSequenceDescribing} from "../session/videoslot/combinations/SymbolsSequenceDescribing.js";
import {LinesDefinitionsFor5x3} from "../session/videoslot/linesdefinitions/LinesDefinitionsFor5x3.js";
import {LeftToRightLinesPatterns} from "../session/videoslot/linespatterns/LeftToRightLinesPatterns.js";
import type {LinesPatternsDescribing} from "../session/videoslot/linespatterns/LinesPatternsDescribing.js";
import {ScatteredLinesPatterns} from "../session/videoslot/linespatterns/ScatteredLinesPatterns.js";
import {Paytable} from "../session/videoslot/paytable/Paytable.js";
import {VideoSlotWinCalculator} from "../session/videoslot/wincalculator/VideoSlotWinCalculator.js";
import type {VideoSlotWinCalculating} from "../session/videoslot/wincalculator/VideoSlotWinCalculating.js";

// This is intentionally a public, small fixture contract: Studio's package fixture and the isolated
// examples consumer both construct this exact game.  Keeping it here prevents PC-12's browser
// comparison from accidentally pairing two look-alike free-games implementations.
export const PC_12_FREE_GAMES_FIXTURE_ID = "pc-12-free-games-fixture";
export const PC_12_FEATURED_ROUND_SEED = "fixture-round";

function hashSeed(seed: string | number): number {
    let hash = 0x811c9dc5;
    for (const character of String(seed)) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}

class Pc12FreeGamesConfig extends VideoSlotWithFreeGamesConfig {
    private readonly normalSequences: SymbolsSequence[];
    private readonly freeGamesSequences: SymbolsSequence[];
    private readonly normalPatterns: LeftToRightLinesPatterns;
    private readonly freeGamesPatterns: ScatteredLinesPatterns;
    private freeGamesMode = false;

    public constructor() {
        super();
        this.setCreditsAmount(10000);
        const paytable = new Paytable(this.getAvailableBets(), this.getAvailableSymbols(), this.getWildSymbols(), this.getReelsNumber());
        this.getAvailableSymbols().filter((symbol) => !this.isSymbolWild(symbol)).forEach((symbol) => {
            paytable.setPayoutForSymbol(symbol, 2, 1);
            paytable.setPayoutForSymbol(symbol, 3, 2);
            paytable.setPayoutForSymbol(symbol, 4, 3);
            paytable.setPayoutForSymbol(symbol, 5, 4);
        });
        this.setPaytable(paytable);
        this.normalPatterns = new LeftToRightLinesPatterns(this.getReelsNumber(), 2);
        this.freeGamesPatterns = new ScatteredLinesPatterns(this.getReelsNumber(), 2);
        this.setLinesDefinitions(new LinesDefinitionsFor5x3());

        // VideoSlotWithFreeGamesConfig's default strips are shuffled at construction.  Use fixed
        // strips so the public seed is the complete round identity across separate browser hosts.
        const symbols = this.getAvailableSymbols();
        this.normalSequences = Array.from({length: this.getReelsNumber()}, (_, reel) =>
            new SymbolsSequence().fromArray(Array.from({length: 40}, (_, index) => symbols[(index + reel) % symbols.length])),
        );
        this.freeGamesSequences = this.normalSequences.map((sequence) =>
            new SymbolsSequence().fromArray(sequence.toArray()).removeAllSymbols(this.getScatterSymbols()[0]),
        );
    }

    public setFreeGamesMode(value: boolean): void {
        this.freeGamesMode = value;
    }

    public isFreeGamesMode(): boolean {
        return this.freeGamesMode;
    }

    public getSymbolsSequences(): SymbolsSequenceDescribing[] {
        return this.freeGamesMode ? this.freeGamesSequences : this.normalSequences;
    }

    public getLinesPatterns(): LinesPatternsDescribing {
        return this.freeGamesMode ? this.freeGamesPatterns : this.normalPatterns;
    }
}

class Pc12FreeGamesSession extends VideoSlotWithFreeGamesSession {
    public constructor(private readonly fixtureConfig: Pc12FreeGamesConfig, combinationsGenerator: SymbolsCombinationsGenerating, winCalculator: VideoSlotWinCalculating) {
        super(fixtureConfig, combinationsGenerator, winCalculator);
    }

    public play(): void {
        super.play();
        this.fixtureConfig.setFreeGamesMode(this.getFreeGamesSum() > 0 && this.getFreeGamesNum() !== this.getFreeGamesSum());
    }
}

class Pc12FreeGamesWinCalculator extends VideoSlotWinCalculator {
    private multipliedLines: Record<string, WinningLineDescribing> | undefined;
    private multipliedScatters: Record<string, WinningScatterDescribing> | undefined;

    public constructor(private readonly fixtureConfig: Pc12FreeGamesConfig) {
        super(fixtureConfig);
    }

    public calculateWin(bet: number, symbolsCombination: SymbolsCombinationDescribing): void {
        super.calculateWin(bet, symbolsCombination);
        if (!this.fixtureConfig.isFreeGamesMode()) {
            this.multipliedLines = undefined;
            this.multipliedScatters = undefined;
            return;
        }
        this.multipliedScatters = Object.fromEntries(Object.values(super.getWinningScatters()).map((scatter) => [scatter.getSymbolId(), new WinningScatter(scatter.getSymbolId(), scatter.getSymbolsPositions(), scatter.getWinAmount() * 2)]));
        this.multipliedLines = Object.fromEntries(Object.values(super.getWinningLines()).map((line) => [line.getLineId(), new WinningLine(line.getWinAmount() * 2, line.getDefinition(), line.getPattern(), line.getLineId(), line.getSymbolsPositions(), line.getWildSymbolsPositions(), line.getSymbolId())]));
    }

    public getWinningLines(): Record<string, WinningLineDescribing> {
        return this.multipliedLines ?? super.getWinningLines();
    }

    public getWinningScatters(): Record<string, WinningScatterDescribing> {
        return this.multipliedScatters ?? super.getWinningScatters();
    }
}

export function createPc12FreeGamesFixtureSession(seed: string | number = PC_12_FEATURED_ROUND_SEED): VideoSlotWithFreeGamesSession {
    const config = new Pc12FreeGamesConfig();
    return new Pc12FreeGamesSession(config, new SymbolsCombinationsGenerator(config, new SeededRandomNumberGenerator(hashSeed(seed))), new Pc12FreeGamesWinCalculator(config));
}
