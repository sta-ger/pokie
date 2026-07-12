import crypto from "crypto";
import {promises as fs} from "fs";
import path from "path";
import type {PokieSessionState} from "./PokieSessionState.js";
import {SessionVersionConflictError} from "./SessionVersionConflictError.js";
import type {VersionedSessionRepository, VersionedSessionState} from "./VersionedSessionRepository.js";

// Persists one JSON file per session under `directory`, so sessions restore after a `pokie serve`
// restart. Filenames are a SHA-256 hash of the sessionId rather than the sessionId itself, since
// sessionId ends up in a URL segment and must never be usable for path traversal into `directory`.
// A missing or corrupted (unparsable) file is treated as "no state" rather than thrown, so a
// restart-with-stale-or-tampered-file behaves the same as an unknown sessionId (404), not a crash.
//
// Also implements VersionedSessionRepository: each file stores `{version, state}` rather than a raw
// PokieSessionState. saveVersioned() re-reads the file immediately before writing, so a concurrent
// writer is caught rather than silently overwritten — this specifically matters across multiple
// PokieDevServer instances/processes sharing this same directory, since a single instance's own
// SpinCommandHandler already serializes every command for one sessionId through its own per-session
// queue (see that class's doc comment). This narrows, but does not close, the read-then-write race:
// there's no file lock, so two processes reading the same expectedVersion at nearly the same instant
// can both pass the check before either writes — a production deployment needing that guarantee must
// provide its own locking/transactional store (see SpinCommandHandler's own doc comment on this same
// tradeoff for wallet/idempotency writes). A file predating this feature (a raw PokieSessionState with
// no envelope) is treated as version 0, so the very next save upgrades it to the versioned format.
export class FileSessionRepository implements VersionedSessionRepository {
    private readonly directory: string;

    constructor(directory: string) {
        this.directory = directory;
    }

    public async save(sessionId: string, state: PokieSessionState): Promise<void> {
        const current = await this.readRecord(sessionId);
        await this.writeRecord(sessionId, {version: (current?.version ?? 0) + 1, state});
    }

    public async load(sessionId: string): Promise<PokieSessionState | undefined> {
        const record = await this.readRecord(sessionId);
        return record?.state;
    }

    public loadVersioned(sessionId: string): Promise<VersionedSessionState | undefined> {
        return this.readRecord(sessionId);
    }

    public async saveVersioned(sessionId: string, state: PokieSessionState, expectedVersion: number): Promise<number> {
        const current = await this.readRecord(sessionId);
        const currentVersion = current?.version ?? 0;
        if (currentVersion !== expectedVersion) {
            throw new SessionVersionConflictError(sessionId, expectedVersion, currentVersion);
        }
        const newVersion = currentVersion + 1;
        await this.writeRecord(sessionId, {version: newVersion, state});
        return newVersion;
    }

    private async readRecord(sessionId: string): Promise<VersionedSessionState | undefined> {
        try {
            const raw = await fs.readFile(this.filePathFor(sessionId), "utf-8");
            const parsed = JSON.parse(raw) as {version?: unknown; state?: unknown};
            if (typeof parsed.version === "number" && parsed.state !== undefined) {
                return {version: parsed.version, state: parsed.state as PokieSessionState};
            }
            // Pre-versioning file: a raw PokieSessionState with no envelope. Treated as version 0 so
            // the very next save (through either save() or saveVersioned()) upgrades it in place.
            return {version: 0, state: parsed as unknown as PokieSessionState};
        } catch {
            return undefined;
        }
    }

    private async writeRecord(sessionId: string, record: VersionedSessionState): Promise<void> {
        await fs.mkdir(this.directory, {recursive: true});
        await fs.writeFile(this.filePathFor(sessionId), JSON.stringify(record), "utf-8");
    }

    private filePathFor(sessionId: string): string {
        const fileName = crypto.createHash("sha256").update(sessionId).digest("hex");
        return path.join(this.directory, `${fileName}.json`);
    }
}
