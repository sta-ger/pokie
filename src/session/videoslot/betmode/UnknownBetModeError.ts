export class UnknownBetModeError extends Error {
    private readonly modeId: string;
    private readonly availableModeIds: readonly string[];

    constructor(modeId: string, availableModeIds: readonly string[]) {
        super(`Unknown bet mode "${modeId}". Available modes: ${availableModeIds.join(", ")}.`);
        this.name = "UnknownBetModeError";
        this.modeId = modeId;
        this.availableModeIds = availableModeIds;
    }

    public getModeId(): string {
        return this.modeId;
    }

    public getAvailableModeIds(): readonly string[] {
        return this.availableModeIds;
    }
}
