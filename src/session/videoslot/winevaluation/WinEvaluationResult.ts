import {ClusterWinComponent} from "./ClusterWinComponent.js";
import {LineWinComponent} from "./LineWinComponent.js";
import {ScatterWinComponent} from "./ScatterWinComponent.js";
import {ValueWinComponent} from "./ValueWinComponent.js";
import {WaysWinComponent} from "./WaysWinComponent.js";
import {WinComponent} from "./WinComponent.js";
import {WinMultiplierBreakdown} from "./WinMultiplierBreakdown.js";

export class WinEvaluationResult<T extends string | number | symbol = string> {
    private readonly lineWins: LineWinComponent<T>[];
    private readonly scatterWins: ScatterWinComponent<T>[];
    private readonly clusterWins: ClusterWinComponent<T>[];
    private readonly waysWins: WaysWinComponent<T>[];
    private readonly valueWins: ValueWinComponent<T>[];
    private readonly winComponents: WinComponent<T>[];
    private readonly metadata: Record<string, unknown>;
    private readonly auditTrail: Record<string, unknown>[];

    constructor(args?: {
        lineWins?: LineWinComponent<T>[];
        scatterWins?: ScatterWinComponent<T>[];
        clusterWins?: ClusterWinComponent<T>[];
        waysWins?: WaysWinComponent<T>[];
        valueWins?: ValueWinComponent<T>[];
        winComponents?: WinComponent<T>[];
        metadata?: Record<string, unknown>;
        auditTrail?: Record<string, unknown>[];
    }) {
        this.lineWins = [...(args?.lineWins ?? [])];
        this.scatterWins = [...(args?.scatterWins ?? [])];
        this.clusterWins = [...(args?.clusterWins ?? [])];
        this.waysWins = [...(args?.waysWins ?? [])];
        this.valueWins = [...(args?.valueWins ?? [])];
        this.winComponents = [
            ...(args?.winComponents ?? [
                ...this.lineWins,
                ...this.scatterWins,
                ...this.clusterWins,
                ...this.waysWins,
                ...this.valueWins,
            ]),
        ];
        this.metadata = {...(args?.metadata ?? {})};
        this.auditTrail = (args?.auditTrail ?? []).map((entry) => ({...entry}));
    }

    public getLineWins(): LineWinComponent<T>[] {
        return [...this.lineWins];
    }

    public getScatterWins(): ScatterWinComponent<T>[] {
        return [...this.scatterWins];
    }

    public getClusterWins(): ClusterWinComponent<T>[] {
        return [...this.clusterWins];
    }

    public getWaysWins(): WaysWinComponent<T>[] {
        return [...this.waysWins];
    }

    public getValueWins(): ValueWinComponent<T>[] {
        return [...this.valueWins];
    }

    public getWinComponents(): WinComponent<T>[] {
        return [...this.winComponents];
    }

    public getTotalWin(): number {
        return this.winComponents.reduce((sum, component) => sum + component.getWinAmount(), 0);
    }

    public getWinningPositions(): number[][] {
        const positionsByKey = new Map<string, number[]>();
        this.winComponents.forEach((component) => {
            component.getWinningPositions().forEach((position) => {
                positionsByKey.set(position.join(":"), [...position]);
            });
        });
        return Array.from(positionsByKey.values());
    }

    public getMultiplierBreakdown(): WinMultiplierBreakdown[] {
        return this.winComponents.flatMap((component) => component.getMultiplierBreakdown());
    }

    public getMetadata(): Record<string, unknown> {
        return {...this.metadata};
    }

    public getAuditTrail(): Record<string, unknown>[] {
        return this.auditTrail.map((entry) => ({...entry}));
    }
}
