import type {PokieSessionState} from "./PokieSessionState.js";
import {SessionVersionConflictError} from "./SessionVersionConflictError.js";
import type {VersionedSessionRepository, VersionedSessionState} from "./VersionedSessionRepository.js";

type NodeFileSystem = typeof import("node:fs/promises");
type NodeCrypto = typeof import("node:crypto");
type NodePath = typeof import("node:path");
type NodeFileRuntime = {readonly fs: NodeFileSystem; readonly crypto: NodeCrypto; readonly path: NodePath};

/** A stored session exists but cannot be parsed as a valid JSON record. */
export class SessionStateCorruptError extends Error {
    constructor(sessionId: string, cause: unknown) {
        super(`Stored session "${sessionId}" is corrupt: ${cause instanceof Error ? cause.message : String(cause)}`);
        this.name = "SessionStateCorruptError";
    }
}

/** The repository could not read an existing session for an operational reason. */
export class SessionStateReadError extends Error {
    constructor(sessionId: string, cause: unknown) {
        super(`Could not read stored session "${sessionId}": ${cause instanceof Error ? cause.message : String(cause)}`);
        this.name = "SessionStateReadError";
    }
}

// This module remains part of the root package entry point for its server-side public API. Keep its
// Node built-ins behind a runtime boundary so a browser consumer importing an unrelated root export
// (such as a game model) does not fail its production bundle while resolving `fs.promises`.
function loadNodeFileRuntime(): Promise<NodeFileRuntime> {
    return Promise.all([import("node:fs/promises"), import("node:crypto"), import("node:path")]).then(([fs, crypto, path]) => ({fs, crypto, path}));
}

// Persists one JSON file per session under `directory`, so sessions restore after a `pokie serve`
// restart. Filenames are a SHA-256 hash of the sessionId rather than the sessionId itself, since
// sessionId ends up in a URL segment and must never be usable for path traversal into `directory`.
// Only an absent file means "no state". Corruption and operational read errors are explicit: treating
// either as a missing session turns a recoverable storage incident into an apparent data loss.
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
    private readonly nodeRuntime: Promise<NodeFileRuntime>;

    constructor(directory: string) {
        this.directory = directory;
        this.nodeRuntime = loadNodeFileRuntime();
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
        const tail = result.then(
            () => undefined,
            () => undefined,
        );
        this.writeQueues.set(sessionId, tail);
        // The map is a serialization aid, not a historical log.  Delete only
        // our own tail so a newer enqueue cannot be accidentally removed.
        tail.then(
            () => {
                if (this.writeQueues.get(sessionId) === tail) {
                    this.writeQueues.delete(sessionId);
                }
            },
            () => undefined,
        );
        return result;
    }

    private async readRecord(sessionId: string): Promise<VersionedSessionState | undefined> {
        try {
            const {fs} = await this.nodeRuntime;
            const raw = await fs.readFile(await this.filePathFor(sessionId), "utf-8");
            try {
                return parseStoredRecord(JSON.parse(raw));
            } catch (error) {
                throw new SessionStateCorruptError(sessionId, error);
            }
        } catch (error) {
            if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
                return undefined;
            }
            if (error instanceof SessionStateCorruptError) {
                throw error;
            }
            if (error instanceof SyntaxError) {
                throw new SessionStateCorruptError(sessionId, error);
            }
            throw new SessionStateReadError(sessionId, error);
        }
    }

    private async writeRecord(sessionId: string, record: VersionedSessionState): Promise<void> {
        assertValidSessionState(record.state);
        if (!Number.isSafeInteger(record.version) || record.version < 0) {
            throw new Error("Session record version must be a non-negative safe integer.");
        }
        const {fs, crypto} = await this.nodeRuntime;
        await fs.mkdir(this.directory, {recursive: true});
        const destination = await this.filePathFor(sessionId);
        // Same-directory rename is atomic on every filesystem POKIE supports.
        // A reader therefore sees either the previous complete record or the
        // new complete record, never a briefly absent/truncated target.
        const temporary = `${destination}.tmp-${crypto.randomUUID()}`;
        try {
            await fs.writeFile(temporary, JSON.stringify(record), "utf-8");
            await fs.rename(temporary, destination);
        } catch (error) {
            await fs.rm(temporary, {force: true}).catch(() => undefined);
            throw error;
        }
    }

    private async filePathFor(sessionId: string): Promise<string> {
        const {crypto, path} = await this.nodeRuntime;
        const fileName = crypto.createHash("sha256").update(sessionId).digest("hex");
        return path.join(this.directory, `${fileName}.json`);
    }
}

function parseStoredRecord(value: unknown): VersionedSessionState {
    if (!isRecord(value)) {
        throw new Error("Session record must be a JSON object.");
    }
    if (hasOwn(value, "version") || hasOwn(value, "state")) {
        if (!Number.isSafeInteger(value.version) || (value.version as number) < 0 || !hasOwn(value, "state")) {
            throw new Error("Session record envelope must contain a non-negative safe-integer version and state.");
        }
        assertValidSessionState(value.state);
        return {version: value.version as number, state: value.state};
    }

    // Legacy raw PokieSessionState records are version 0, but are still
    // validated before being allowed back into a live runtime.
    assertValidSessionState(value);
    return {version: 0, state: value};
}

function assertValidSessionState(value: unknown): asserts value is PokieSessionState {
    if (!isRecord(value)) {
        throw new Error("Session state must be a JSON object.");
    }
    for (const key of ["bet", "win"] as const) {
        if (typeof value[key] !== "number" || !Number.isFinite(value[key])) {
            throw new Error(`Session state.${key} must be finite.`);
        }
    }
    if (value.screen !== undefined && !Array.isArray(value.screen)) {
        throw new Error("Session state.screen must be an array when present.");
    }
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}
