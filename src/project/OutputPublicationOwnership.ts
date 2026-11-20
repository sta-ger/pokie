import {removePublishedDirectoryIfOwned} from "../stakeengine/internal/publishDirectoryAtomically.js";
import fs from "fs";
import path from "path";
import {assertBuildNotCancelled, type BuildOutputOptions} from "./BuildOutputOptions.js";
import {BuildConflictError} from "./BuildConflictError.js";
import type {BuildOutputResult} from "./BuildOutputResult.js";

type FileOwnership = NonNullable<BuildOutputResult["publishedFileOwnership"]>[number];
type DirectoryOwnership = NonNullable<BuildOutputResult["publishedDirectoryOwnership"]>[number];

/** No-replacement publication of staged bytes, with an inventory for later rollback. */
export class OutputPublicationOwnership {
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
            if (requireEmpty && (await fs.promises.readdir(directory)).length > 0) throw new BuildConflictError(`"${directory}" already exists and is not empty. Choose a different --out path.`);
        };
        const guard = this.directories.find(entry => entry.path === directory);
        if (guard) {
            const current = await fs.promises.lstat(directory);
            if (current.dev !== guard.dev || current.ino !== guard.ino) throw new BuildConflictError(`"${directory}" was replaced during publication.`);
            await assertEmpty();
            return;
        }
        try {
            const current = await fs.promises.lstat(directory);
            if (!current.isDirectory()) throw new BuildConflictError(`"${directory}" already exists and is not a directory.`);
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

    public async publish(stagedPath: string, outputPath: string, options?: BuildOutputOptions): Promise<void> {
        assertBuildNotCancelled(options);
        const staged = await fs.promises.lstat(stagedPath);
        if (staged.isDirectory()) {
            await this.ensureDirectory(outputPath, true);
            for (const name of await fs.promises.readdir(stagedPath)) {
                await this.publish(path.join(stagedPath, name), path.join(outputPath, name), options);
            }
            return;
        }
        await this.ensureDirectory(path.dirname(outputPath));
        assertBuildNotCancelled(options);
        try {
            if (this.independentFiles) {
                await this.publishIndependent(stagedPath, outputPath, staged);
            } else {
                await fs.promises.link(stagedPath, outputPath);
                this.files.push({path: outputPath, dev: staged.dev, ino: staged.ino});
            }
            assertBuildNotCancelled(options);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "EEXIST") throw new BuildConflictError(`"${outputPath}" already exists. Choose a different --out path.`);
            throw error;
        }
    }

    private async publishIndependent(stagedPath: string, outputPath: string, staged: fs.Stats): Promise<void> {
        if (staged.isSymbolicLink()) {
            // Allocate on the destination filesystem, then publish the known inode.
            // A post-symlink lstat of outputPath could instead claim another writer's link.
            const directory = await fs.promises.mkdtemp(path.join(path.dirname(outputPath), ".pokie-publication-"));
            const allocated = await fs.promises.lstat(directory);
            const temporaryFiles: FileOwnership[] = [];
            try {
                const temporary = path.join(directory, "link");
                await fs.promises.symlink(await fs.promises.readlink(stagedPath), temporary);
                const owned = await fs.promises.lstat(temporary);
                temporaryFiles.push({path: temporary, dev: owned.dev, ino: owned.ino});
                await fs.promises.link(temporary, outputPath);
                this.files.push({path: outputPath, dev: owned.dev, ino: owned.ino});
            } finally {
                await rollbackArtifactPublication({
                    publishedFileOwnership: temporaryFiles,
                    publishedDirectoryOwnership: [
                        ...this.directories.map(guard => ({...guard, removeOnRollback: false})),
                        {path: directory, dev: allocated.dev, ino: allocated.ino, removeOnRollback: true},
                    ],
                });
            }
            return;
        }
        const file = await fs.promises.open(outputPath, "wx", staged.mode);
        try {
            const owned = await file.stat();
            this.files.push({path: outputPath, dev: owned.dev, ino: owned.ino});
            await file.chmod(staged.mode);
            await file.writeFile(fs.createReadStream(stagedPath));
            // Preserve source/build ordering on our allocation, even if its path was replaced.
            await file.utimes(staged.atime, staged.mtime);
        } finally {
            await file.close();
        }
    }
}

/** Remove only unchanged publications; nonempty directories and replaced ancestors survive. */
export async function rollbackArtifactPublication(result: Pick<BuildOutputResult, "publishedFileOwnership" | "publishedDirectoryOwnership" | "publishedStakeDirectoryOwnership">): Promise<void> {
    const stake = result.publishedStakeDirectoryOwnership;
    if (stake !== undefined && removePublishedDirectoryIfOwned(stake) && stake.restoreEmptyOnRollback) {
        // The publisher displaced a caller-created empty directory. Restore an empty
        // destination only after removing our own identity; never clear a replacement.
        try {
            await fs.promises.mkdir(stake.outDir);
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        }
    }
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
