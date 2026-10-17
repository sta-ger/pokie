import fs from "fs";
import path from "path";
import {digest, assertNoFilesystemAliases} from "./optimizationData.js";

/** Synchronous commit section: no application task can interleave the multi-file write.
 * External edits are compared before replacement and rollback only restores owned bytes.
 */
export function applyAuthoredFiles(files: {file: string; before: Buffer; after: Buffer}[], assertCurrent: () => void, stagingParent: string, ownership: Set<string>): void {
    const prepared: {file: string; temporary: string; before: Buffer; after: Buffer; installed?: fs.Stats}[] = [];
    let failure: unknown;
    try {
        for (const item of files) {
            assertNoFilesystemAliases(item.file);
            const temporary = fs.mkdtempSync(path.join(stagingParent, ".pokie-apply-"));
            ownership.add(temporary);
            const entry = {...item, temporary};
            prepared.push(entry);
            fs.writeFileSync(path.join(temporary, "new"), item.after, {flag: "wx", mode: fs.statSync(item.file).mode});
        }
        assertCurrent();
        for (const item of prepared) {
            assertNoFilesystemAliases(item.file);
            if (!fs.readFileSync(item.file).equals(item.before)) throw new Error(`Concurrent source edit: ${item.file}. Refresh and optimize again.`);
        }
        for (const item of prepared) {
            if (!fs.readFileSync(item.file).equals(item.before)) throw new Error(`Concurrent source edit: ${item.file}.`);
            const staged = path.join(item.temporary, "new");
            // Capture ownership before rename so a post-rename error still permits rollback.
            item.installed = fs.statSync(staged);
            fs.renameSync(staged, item.file);
        }
        for (const item of prepared) {
            fs.rmSync(item.temporary, {recursive: true});
            ownership.delete(item.temporary);
        }
        return;
    } catch (error) {
        failure = error;
    }
    const recovery: string[] = [];
    for (const item of [...prepared].reverse()) {
        try {
            if (item.installed) {
                const current = fs.lstatSync(item.file);
                if (current.dev === item.installed.dev && current.ino === item.installed.ino && digest(fs.readFileSync(item.file)) === digest(item.after)) {
                    fs.writeFileSync(item.file, item.before);
                } else if (!fs.readFileSync(item.file).equals(item.before)) recovery.push(`Concurrent edit retained at ${item.file}; inspect before retrying.`);
            }
            fs.rmSync(item.temporary, {recursive: true, force: true});
            ownership.delete(item.temporary);
        } catch (error) {
            recovery.push(`${item.file}: ${String(error)}`);
        }
    }
    throw new Error(`Authored apply failed: ${String(failure)}${recovery.length ? ` Recovery required: ${recovery.join("; ")}` : " Original source restored."}`);
}
