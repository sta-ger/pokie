import crypto from "crypto";
import {promises as fs} from "fs";
import path from "path";
import type {PokieSessionState} from "./PokieSessionState.js";
import type {SessionRepository} from "./SessionRepository.js";

// Persists one JSON file per session under `directory`, so sessions restore after a `pokie serve`
// restart. Filenames are a SHA-256 hash of the sessionId rather than the sessionId itself, since
// sessionId ends up in a URL segment and must never be usable for path traversal into `directory`.
// A missing or corrupted (unparsable) file is treated as "no state" rather than thrown, so a
// restart-with-stale-or-tampered-file behaves the same as an unknown sessionId (404), not a crash.
export class FileSessionRepository implements SessionRepository {
    private readonly directory: string;

    constructor(directory: string) {
        this.directory = directory;
    }

    public async save(sessionId: string, state: PokieSessionState): Promise<void> {
        await fs.mkdir(this.directory, {recursive: true});
        await fs.writeFile(this.filePathFor(sessionId), JSON.stringify(state), "utf-8");
    }

    public async load(sessionId: string): Promise<PokieSessionState | undefined> {
        try {
            const raw = await fs.readFile(this.filePathFor(sessionId), "utf-8");
            return JSON.parse(raw) as PokieSessionState;
        } catch {
            return undefined;
        }
    }

    private filePathFor(sessionId: string): string {
        const fileName = crypto.createHash("sha256").update(sessionId).digest("hex");
        return path.join(this.directory, `${fileName}.json`);
    }
}
