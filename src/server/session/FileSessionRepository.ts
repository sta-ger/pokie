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
// PokieSessionState. save()/saveVersioned() for a given sessionId are serialized through an
// in-process per-sessionId queue (see enqueue() below) before the read-then-write that decides the
// next version, so two concurrent calls *against this same instance* (e.g. two callers racing a
// FileSessionRepository directly, without going through SpinCommandHandler's own per-session queue —
// which already serializes ordinary spins one instance at a time) can never both read the same
// version and both write: fs.readFile/fs.writeFile are async and yield to the event loop, so without
// this queue two such calls would otherwise interleave and silently corrupt each other's write, no
// conflict ever raised. This queue is purely in-memory, though, so it only protects calls made
// through *this* FileSessionRepository object — it does nothing for two separate
// FileSessionRepository instances (e.g. two PokieDevServer processes) pointed at the same directory.
// For that cross-instance/cross-process case, saveVersioned() still re-reads the file immediately
// before writing and does narrow the race, but does not close it: there is no OS-level file lock, so
// two processes reading the same expectedVersion at nearly the same instant can both pass the check
// before either writes — last write wins for the loser, silently. A deployment needing a hard
// guarantee across processes must provide its own locking or a transactional store, the same
// tradeoff SpinCommandHandler's own doc comment describes for wallet/idempotency durability. A file
// predating this feature (a raw PokieSessionState with no envelope) is treated as version 0, so the
// very next save upgrades it to the versioned format.
export class FileSessionRepository implements VersionedSessionRepository {
    private readonly directory: string;
    private readonly writeQueues = new Map<string, Promise<unknown>>();

    constructor(directory: string) {
        this.directory = directory;
    }

    public save(sessionId: string, state: PokieSessionState): Promise<void> {
        return this.enqueue(sessionId, async () => {
            const current = await this.readRecord(sessionId);
            await this.writeRecord(sessionId, {version: (current?.version ?? 0) + 1, state});
        });
    }

    public async load(sessionId: string): Promise<PokieSessionState | undefined> {
        const record = await this.readRecord(sessionId);
        return record?.state;
    }

    public loadVersioned(sessionId: string): Promise<VersionedSessionState | undefined> {
        return this.readRecord(sessionId);
    }

    public saveVersioned(sessionId: string, state: PokieSessionState, expectedVersion: number): Promise<number> {
        return this.enqueue(sessionId, async () => {
            const current = await this.readRecord(sessionId);
            const currentVersion = current?.version ?? 0;
            if (currentVersion !== expectedVersion) {
                throw new SessionVersionConflictError(sessionId, expectedVersion, currentVersion);
            }
            const newVersion = currentVersion + 1;
            await this.writeRecord(sessionId, {version: newVersion, state});
            return newVersion;
        });
    }

    // Chains `work` onto whatever save()/saveVersioned() is already queued for sessionId, so this
    // instance never has two overlapping read-then-write attempts in flight for the same sessionId —
    // see the class doc comment for exactly what this does and doesn't protect against. Mirrors
    // SpinCommandHandler's own enqueue()/sessionQueues.
    private enqueue<T>(sessionId: string, work: () => Promise<T>): Promise<T> {
        const previous = this.writeQueues.get(sessionId) ?? Promise.resolve();
        const result = previous.then(work, work);
        this.writeQueues.set(
            sessionId,
            result.then(
                () => undefined,
                () => undefined,
            ),
        );
        return result;
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
