import fs from "fs";
import path from "path";
import {PreparationState} from "./PreparationState.js";

// Not "pokie" prefixed alone -- deliberately unlikely to collide with any file a hand-written or
// generated game package would ever have a reason to contain.
export const PREPARATION_STATE_FILE = ".pokie-prepare-state.json";

// Undefined covers every case that means "not a resumable GamePackagePreparer directory": the
// directory doesn't exist yet, it exists but was never touched by this tool, or its marker is
// unreadable/corrupt -- every one of those is treated as "start fresh", never a thrown error.
export function readPreparationState(projectRoot: string): PreparationState | undefined {
    const statePath = path.join(projectRoot, PREPARATION_STATE_FILE);
    if (!fs.existsSync(statePath)) {
        return undefined;
    }
    try {
        return JSON.parse(fs.readFileSync(statePath, "utf-8")) as PreparationState;
    } catch {
        return undefined;
    }
}

export function writePreparationState(projectRoot: string, state: PreparationState): void {
    fs.writeFileSync(path.join(projectRoot, PREPARATION_STATE_FILE), `${JSON.stringify(state, null, 4)}\n`);
}

export function clearPreparationState(projectRoot: string): void {
    const statePath = path.join(projectRoot, PREPARATION_STATE_FILE);
    if (fs.existsSync(statePath)) {
        fs.rmSync(statePath);
    }
}
