// Thrown by VersionedSessionRepository.saveVersioned() when the caller's expectedVersion doesn't
// match the repository's current version for sessionId — someone else's save already moved it on.
// Not required by the VersionedSessionRepository contract itself (a custom implementation may throw
// its own error type instead) — InMemorySessionRepository/FileSessionRepository's own saveVersioned()
// throw this one, and SpinCommandHandler specifically catches it to distinguish "session updated
// concurrently" (a "conflict" SpinCommandResult) from any other save failure.
export class SessionVersionConflictError extends Error {
    private readonly sessionId: string;
    private readonly expectedVersion: number;
    private readonly currentVersion: number;

    constructor(sessionId: string, expectedVersion: number, currentVersion: number) {
        super(
            `Session "${sessionId}" was updated concurrently: expected version ${expectedVersion}, ` +
                `but the repository is currently at version ${currentVersion}.`,
        );
        this.name = "SessionVersionConflictError";
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
