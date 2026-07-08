export class MaxCascadeStepsExceededError extends Error {
    private readonly maxCascadeSteps: number;
    private readonly cascadeStepCount: number;

    constructor(maxCascadeSteps: number, cascadeStepCount: number) {
        super(`Maximum cascade steps exceeded: max ${maxCascadeSteps}, reached ${cascadeStepCount}`);
        this.maxCascadeSteps = maxCascadeSteps;
        this.cascadeStepCount = cascadeStepCount;
    }

    public getMaxCascadeSteps(): number {
        return this.maxCascadeSteps;
    }

    public getCascadeStepCount(): number {
        return this.cascadeStepCount;
    }
}
