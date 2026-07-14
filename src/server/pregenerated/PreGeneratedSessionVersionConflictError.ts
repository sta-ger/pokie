// Thrown by VersionedPreGeneratedSessionRepository.saveVersioned() when the caller's expectedVersion
// doesn't match the repository's current version for sessionId — someone else's save already moved it
// on. Mirrors SessionVersionConflictError exactly, for the pre-generated round path:
// PreGeneratedSpinCommandHandler specifically catches this one to distinguish "session updated
// concurrently" (a "conflict" PreGeneratedSpinCommandResult) from any other save failure.
export class PreGeneratedSessionVersionConflictError extends Error {
    private readonly sessionId: string;
    private readonly expectedVersion: number;
    private readonly currentVersion: number;

    constructor(sessionId: string, expectedVersion: number, currentVersion: number) {
        super(
            `Pre-generated session "${sessionId}" was updated concurrently: expected version ${expectedVersion}, ` +
                `but the repository is currently at version ${currentVersion}.`,
        );
        this.name = "PreGeneratedSessionVersionConflictError";
        this.sessionId = sessionId;
        this.expectedVersion = expectedVersion;
        this.currentVersion = currentVersion;
    }

    public getSessionId(): string {
        return this.sessionId;
    }

    public getExpectedVersion(): number {
        return this.expectedVersion;
    }

    public getCurrentVersion(): number {
        return this.currentVersion;
    }
}
