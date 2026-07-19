import {BetModeDefinition} from "./BetModeDefinition.js";
import type {BetModeDescribing} from "./BetModeDescribing.js";
import type {BetModesConfigRepresenting} from "./BetModesConfigRepresenting.js";

// The base/default mode id a game with no configured bet modes plays under -- stakeMultiplier 1,
// forcesFeatureEntry false, so VideoSlotWithBetModesSession with an all-default constructor behaves
// exactly like the plain session it wraps (backward compatibility for games that don't opt in).
export const DEFAULT_BET_MODE_ID = "base";

export class BetModesConfig implements BetModesConfigRepresenting {
    private readonly modes: Map<string, BetModeDescribing>;
    private readonly defaultModeId: string;

    constructor(
        modes: BetModeDescribing[] = [new BetModeDefinition(DEFAULT_BET_MODE_ID)],
        defaultModeId: string = DEFAULT_BET_MODE_ID,
    ) {
        if (modes.length === 0) {
            throw new Error("BetModesConfig requires at least one bet mode.");
        }
        const byId = new Map<string, BetModeDescribing>();
        for (const mode of modes) {
            if (byId.has(mode.getId())) {
                throw new Error(`Duplicate bet mode id "${mode.getId()}".`);
            }
            byId.set(mode.getId(), mode);
        }
        if (!byId.has(defaultModeId)) {
            throw new Error(
                `Default bet mode "${defaultModeId}" is not among the configured modes: ${[...byId.keys()].join(", ")}.`,
            );
        }
        this.modes = byId;
        this.defaultModeId = defaultModeId;
    }

    public getDefaultBetModeId(): string {
        return this.defaultModeId;
    }

    public getBetMode(modeId: string): BetModeDescribing | undefined {
        return this.modes.get(modeId);
    }

    public getBetModeIds(): string[] {
        return [...this.modes.keys()];
    }
}
