// Tracks job executions started outside the request/response cycle so shutdown can wait for their
// cleanup and surface the first failure instead of leaving a detached rejection behind.
export class PendingExecutions {
    private readonly pending = new Set<Promise<void>>();
    private readonly failures: unknown[] = [];

    public track(execution: Promise<void>): void {
        this.pending.add(execution);
        execution.then(
            () => this.pending.delete(execution),
            (error: unknown) => {
                this.failures.push(error);
                this.pending.delete(execution);
            },
        );
    }

    public recordFailure(error: unknown): void {
        this.failures.push(error);
    }

    public async settle(): Promise<void> {
        await Promise.allSettled([...this.pending]);
        if (this.failures.length > 0) {
            throw this.failures[0];
        }
    }
}
