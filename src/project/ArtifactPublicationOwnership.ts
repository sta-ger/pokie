import fs from "fs";
import path from "path";
import {assertArtifactBuildNotCancelled, type ArtifactBuildOptions} from "./ArtifactBuildOptions.js";
import {ArtifactBuildConflictError} from "./ArtifactBuildConflictError.js";
import type {ArtifactBuildResult} from "./ArtifactBuildResult.js";

type FileOwnership = NonNullable<ArtifactBuildResult["publishedFileOwnership"]>[number];
type DirectoryOwnership = NonNullable<ArtifactBuildResult["publishedDirectoryOwnership"]>[number];

/** No-replacement publication of staged bytes, with an inventory for later rollback. */
export class ArtifactPublicationOwnership {
    public readonly files: FileOwnership[] = [];
    public readonly directories: DirectoryOwnership[] = [];
    private readonly independentFiles: boolean;

    public constructor(independentFiles = false) {
        this.independentFiles = independentFiles;
    }

    public async ensureDirectory(directory: string, requireEmpty = false): Promise<void> {
        directory = path.resolve(directory);
        const parent = path.dirname(directory);
        if (parent !== directory) await this.ensureDirectory(parent);
        const assertEmpty = async (): Promise<void> => {
            if (requireEmpty && (await fs.promises.readdir(directory)).length > 0) throw new ArtifactBuildConflictError(`"${directory}" already exists and is not empty. Choose a different --out path.`);
        };
        const guard = this.directories.find(entry => entry.path === directory);
        if (guard) {
            const current = await fs.promises.lstat(directory);
            if (current.dev !== guard.dev || current.ino !== guard.ino) throw new ArtifactBuildConflictError(`"${directory}" was replaced during publication.`);
            await assertEmpty();
            return;
        }
        try {
            const current = await fs.promises.lstat(directory);
            if (!current.isDirectory()) throw new ArtifactBuildConflictError(`"${directory}" already exists and is not a directory.`);
            await assertEmpty();
            this.directories.push({path: directory, dev: current.dev, ino: current.ino, removeOnRollback: false});
            return;
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
        try {
            await fs.promises.mkdir(directory);
            const current = await fs.promises.lstat(directory);
            this.directories.push({path: directory, dev: current.dev, ino: current.ino, removeOnRollback: true});
            await assertEmpty();
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
            // Another writer allocated this directory; it is a guard, never ours to remove.
            await this.ensureDirectory(directory, requireEmpty);
        }
    }

    public async publish(stagedPath: string, outputPath: string, options?: ArtifactBuildOptions): Promise<void> {
        assertArtifactBuildNotCancelled(options);
        const staged = await fs.promises.lstat(stagedPath);
        if (staged.isDirectory()) {
            await this.ensureDirectory(outputPath, true);
            for (const name of await fs.promises.readdir(stagedPath)) {
                await this.publish(path.join(stagedPath, name), path.join(outputPath, name), options);
            }
            return;
        }
        await this.ensureDirectory(path.dirname(outputPath));
        assertArtifactBuildNotCancelled(options);
        try {
            if (this.independentFiles) {
                if (staged.isSymbolicLink()) await fs.promises.symlink(await fs.promises.readlink(stagedPath), outputPath);
                else await fs.promises.copyFile(stagedPath, outputPath, fs.constants.COPYFILE_EXCL);
            } else await fs.promises.link(stagedPath, outputPath);
            const published = await fs.promises.lstat(outputPath);
            this.files.push({path: outputPath, dev: published.dev, ino: published.ino});
            assertArtifactBuildNotCancelled(options);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new ArtifactBuildConflictError(`"${outputPath}" already exists. Choose a different --out path.`);
            throw error;
        }
    }
}

/** Remove only unchanged publications; nonempty directories and replaced ancestors survive. */
export async function rollbackArtifactPublication(result: Pick<ArtifactBuildResult, "publishedFileOwnership" | "publishedDirectoryOwnership">): Promise<void> {
    const directories = result.publishedDirectoryOwnership ?? [];
    const stillOwned = async (entry: FileOwnership): Promise<boolean> => {
        for (const guard of directories) {
            if (entry.path !== guard.path && !path.resolve(entry.path).startsWith(`${guard.path}${path.sep}`)) continue;
            const current = await fs.promises.lstat(guard.path);
            if (current.dev !== guard.dev || current.ino !== guard.ino) return false;
        }
        const current = await fs.promises.lstat(entry.path);
        return current.dev === entry.dev && current.ino === entry.ino;
    };
    for (const entry of result.publishedFileOwnership ?? []) {
        try {
            if (await stillOwned(entry)) await fs.promises.unlink(entry.path);
        } catch {
            // Preserve the original failure, missing files and competing publications.
        }
    }
    for (const entry of [...directories].sort((left, right) => right.path.length - left.path.length)) {
        if (!entry.removeOnRollback) continue;
        try {
            if (await stillOwned(entry)) await fs.promises.rmdir(entry.path);
        } catch {
            // An unrelated child or replacement makes this directory belong to its current writer.
        }
    }
}
