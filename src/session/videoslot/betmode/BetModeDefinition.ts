import type {BetModeDescribing} from "./BetModeDescribing.js";

export interface BetModeDefinitionOptions {
    stakeMultiplier?: number;
    forcesFeatureEntry?: boolean;
    metadata?: Record<string, unknown>;
    targetRtp?: number;
}

export class BetModeDefinition implements BetModeDescribing {
    private readonly id: string;
    private readonly stakeMultiplier: number;
    private readonly forcedFeatureEntry: boolean;
    private readonly metadata: Record<string, unknown> | undefined;
    private readonly targetRtp: number | undefined;

    constructor(id: string, options: BetModeDefinitionOptions = {}) {
        const stakeMultiplier = options.stakeMultiplier ?? 1;
        if (!Number.isFinite(stakeMultiplier) || stakeMultiplier <= 0) {
            throw new Error(`Bet mode "${id}" stakeMultiplier must be a positive finite number, got ${stakeMultiplier}.`);
        }
        if (options.targetRtp !== undefined && !Number.isFinite(options.targetRtp)) {
            throw new Error(`Bet mode "${id}" targetRtp must be a finite number, got ${options.targetRtp}.`);
        }
        this.id = id;
        this.stakeMultiplier = stakeMultiplier;
        this.forcedFeatureEntry = options.forcesFeatureEntry ?? false;
        this.metadata = options.metadata;
        this.targetRtp = options.targetRtp;
    }

    public getId(): string {
        return this.id;
    }

    public getStakeMultiplier(): number {
        return this.stakeMultiplier;
    }

    public forcesFeatureEntry(): boolean {
        return this.forcedFeatureEntry;
    }

    public getMetadata(): Record<string, unknown> | undefined {
        return this.metadata;
    }

    public getTargetRtp(): number | undefined {
        return this.targetRtp;
    }
}
