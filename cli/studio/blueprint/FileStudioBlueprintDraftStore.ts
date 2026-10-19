import crypto from "crypto";
import fs from "fs";
import path from "path";
import {validateStudioBlueprintDraftSnapshot, type StudioBlueprintDraftSnapshot} from "./StudioBlueprintDraft.js";
import type {StudioBlueprintDraftStoring} from "./StudioBlueprintDraftStoring.js";

/** One bounded recovery slot in the local Studio profile, separate from saved user projects. */
export class FileStudioBlueprintDraftStore implements StudioBlueprintDraftStoring {
    private readonly file: string;

    public constructor(file: string) {
        this.file = file;
    }

    public read(): StudioBlueprintDraftSnapshot {
        try {
            if (fs.statSync(this.file).size > 1_048_576) throw new Error("Design draft exceeds the recovery size limit.");
            return validateStudioBlueprintDraftSnapshot(JSON.parse(fs.readFileSync(this.file, "utf8")));
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return {version: null};
            throw error;
        }
    }

    public replace(snapshot: StudioBlueprintDraftSnapshot): StudioBlueprintDraftSnapshot | undefined {
        const input = validateStudioBlueprintDraftSnapshot(snapshot);
        if (this.read().version !== input.version) return undefined;
        const next = {...input, version: crypto.randomBytes(16).toString("hex")};
        const raw = JSON.stringify(next);
        if (Buffer.byteLength(raw) > 1_048_576) throw new Error("Design draft exceeds the recovery size limit.");
        fs.mkdirSync(path.dirname(this.file), {recursive: true});
        const temporary = `${this.file}.${crypto.randomBytes(16).toString("hex")}.tmp`;
        try {
            fs.writeFileSync(temporary, raw, {encoding: "utf8", mode: 0o600, flag: "wx"});
            fs.renameSync(temporary, this.file);
        } finally {
            fs.rmSync(temporary, {force: true});
        }
        // A clear retains a token too: a delayed writer cannot resurrect a discarded draft.
        return next;
    }
}
