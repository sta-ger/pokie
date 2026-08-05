import fs from "fs";
import path from "path";
import {buildPackageJsonPatch, PackageJsonLike, PokieGameManifest, renderTsconfig} from "pokie";
import {deriveManifestDefaults} from "./deriveManifestDefaults.js";
import {GamePackageMergeConflictError, PackageJsonFieldConflict} from "./GamePackageMergeConflictError.js";
import {GamePackageMergeOverrides, GamePackageMerging} from "./GamePackageMerging.js";
import {renderEntryModule} from "./renderEntryModule.js";
import {renderPackageReadme} from "./renderPackageReadme.js";
import {ScaffoldResult} from "./ScaffoldResult.js";

// The POKIE-owned package.json fields merge() refuses to force over a conflicting pre-existing value
// (see detectFieldConflicts) -- each paired with how to read it off a PackageJsonLike so the same list
// drives both the comparison and the error message.
const POKIE_OWNED_FIELDS: {field: string; read: (pkg: PackageJsonLike) => unknown}[] = [
    {field: "main", read: (pkg) => pkg.main},
    {field: "exports", read: (pkg) => pkg.exports},
    {field: "scripts.build", read: (pkg) => pkg.scripts?.build},
    {field: "pokie.entry", read: (pkg) => pkg.pokie?.entry},
];

const DEFAULT_VERSION = "0.1.0";
const FALLBACK_PACKAGE_NAME = "my-game";

// A directory basename becomes package.json's own "name" field by default (see resolveDefaultPackageName
// below) -- but unlike a directory name, an npm package name can't contain spaces, uppercase letters, or
// most punctuation. Slugified so "My Game", "sample_slot", and "." (whose basename is whatever the cwd
// happens to be called) all still produce something `npm install` accepts, rather than surfacing an
// npm-specific validation failure from a directory name nobody chose for that purpose.
function slugifyPackageName(raw: string): string {
    const slug = raw
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9._-]+/g, "-")
        .replace(/^[-.]+|[-.]+$/g, "");
    return slug.length > 0 ? slug : FALLBACK_PACKAGE_NAME;
}

export class GamePackageMerger implements GamePackageMerging {
    private readonly pokieVersion: string;

    constructor(pokieVersion: string) {
        this.pokieVersion = pokieVersion;
    }

    public merge(projectRoot: string, overrides?: GamePackageMergeOverrides): ScaffoldResult {
        const packageJsonPath = path.join(projectRoot, "package.json");
        const packageJsonExisted = fs.existsSync(packageJsonPath);
        const existingPkg: PackageJsonLike = packageJsonExisted
            ? (JSON.parse(fs.readFileSync(packageJsonPath, "utf-8")) as PackageJsonLike)
            : {};

        const packageName = this.resolveDefaultPackageName(projectRoot, existingPkg, overrides?.packageName);
        const idOverride = overrides?.id?.trim();
        const derived = deriveManifestDefaults(idOverride && idOverride.length > 0 ? idOverride : packageName);
        const nameOverride = overrides?.name?.trim();
        const versionOverride = overrides?.version?.trim();
        const version = this.firstNonBlank(versionOverride, existingPkg.version, DEFAULT_VERSION);

        const manifest: PokieGameManifest = {
            id: derived.id,
            name: this.firstNonBlank(nameOverride, derived.name),
            version,
        };

        const patchedPackageJson = buildPackageJsonPatch({...existingPkg, name: packageName, version}, this.pokieVersion);

        // Compared against pristine defaults (an empty input pkg), not `patchedPackageJson` above --
        // buildPackageJsonPatch fills in "scripts.build" from `existingPkg` itself when present, so
        // diffing against the patch of `existingPkg` would never see a pre-existing custom build script
        // as anything other than already-agreeing with itself.
        const conflicts = this.detectFieldConflicts(existingPkg, buildPackageJsonPatch({}, this.pokieVersion));
        if (conflicts.length > 0) {
            throw new GamePackageMergeConflictError(projectRoot, conflicts);
        }

        fs.mkdirSync(path.join(projectRoot, "src"), {recursive: true});

        const createdFiles: string[] = [];
        const updatedFiles: string[] = [];
        const skippedFiles: string[] = [];

        fs.writeFileSync(packageJsonPath, `${JSON.stringify(patchedPackageJson, null, 4)}\n`);
        (packageJsonExisted ? updatedFiles : createdFiles).push("package.json");

        this.writeIfAbsent(path.join(projectRoot, "tsconfig.json"), "tsconfig.json", renderTsconfig(), createdFiles, skippedFiles);
        this.writeIfAbsent(path.join(projectRoot, "README.md"), "README.md", renderPackageReadme(manifest), createdFiles, skippedFiles);
        this.writeIfAbsent(
            path.join(projectRoot, "src", "index.ts"),
            "src/index.ts",
            renderEntryModule(manifest),
            createdFiles,
            skippedFiles,
        );

        return {projectRoot, manifest, createdFiles, updatedFiles, skippedFiles};
    }

    // A field only conflicts when `existingPkg` already defines it (an absent field is simply filled
    // in, same as always) to something other than what POKIE requires there -- compared with
    // JSON.stringify so an object-shaped "exports" is diffed structurally rather than by reference.
    private detectFieldConflicts(existingPkg: PackageJsonLike, requiredPkg: PackageJsonLike): PackageJsonFieldConflict[] {
        const conflicts: PackageJsonFieldConflict[] = [];
        for (const {field, read} of POKIE_OWNED_FIELDS) {
            const existingValue = read(existingPkg);
            if (existingValue === undefined) {
                continue;
            }
            const requiredValue = read(requiredPkg);
            if (JSON.stringify(existingValue) !== JSON.stringify(requiredValue)) {
                conflicts.push({field, existingValue: JSON.stringify(existingValue)!, requiredValue: JSON.stringify(requiredValue)!});
            }
        }
        return conflicts;
    }

    // An explicit --package-name always wins verbatim (a caller who typed one owns the consequences,
    // same as every other override here); short of that, a pre-existing package.json's own "name" is
    // preserved untouched (merging into an existing npm project must never rename it); only with
    // neither does the target directory's own basename -- slugified, since it was never chosen to be
    // an npm package name -- become the default.
    private resolveDefaultPackageName(projectRoot: string, existingPkg: PackageJsonLike, packageNameOverride?: string): string {
        const trimmedOverride = packageNameOverride?.trim();
        if (trimmedOverride && trimmedOverride.length > 0) {
            return trimmedOverride;
        }
        if (existingPkg.name && existingPkg.name.trim().length > 0) {
            return existingPkg.name;
        }
        return slugifyPackageName(path.basename(path.resolve(projectRoot)));
    }

    private firstNonBlank(...candidates: (string | undefined)[]): string {
        for (const candidate of candidates) {
            if (candidate !== undefined && candidate.trim().length > 0) {
                return candidate;
            }
        }
        return "";
    }

    private writeIfAbsent(filePath: string, displayPath: string, content: string, createdFiles: string[], skippedFiles: string[]): void {
        if (fs.existsSync(filePath)) {
            skippedFiles.push(displayPath);
            return;
        }
        fs.writeFileSync(filePath, content);
        createdFiles.push(displayPath);
    }
}
