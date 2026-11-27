import fs from "fs";
import path from "path";
import {buildPackageJsonPatch, PackageJsonLike, PokieGameInfo, renderTsconfig} from "@fromstan/pokie";
import type {PackageModuleFormat} from "../../src/gamepackage/renderTsconfig.js";
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
        this.assertWritableProjectRoot(projectRoot);
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

        const manifest: PokieGameInfo = {
            id: derived.id,
            name: this.firstNonBlank(nameOverride, derived.name),
            version,
        };
        const moduleFormat = this.resolveModuleFormat(projectRoot, existingPkg);
        if (moduleFormat === "esm") this.assertEsmEntryModule(projectRoot);

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

        this.writeIfAbsent(path.join(projectRoot, "tsconfig.json"), "tsconfig.json", renderTsconfig(moduleFormat), createdFiles, skippedFiles);
        this.writeIfAbsent(path.join(projectRoot, "README.md"), "README.md", renderPackageReadme(manifest), createdFiles, skippedFiles);
        this.writeIfAbsent(
            path.join(projectRoot, "src", "index.ts"),
            "src/index.ts",
            renderEntryModule(manifest, moduleFormat),
            createdFiles,
            skippedFiles,
        );

        return {projectRoot, info: manifest, createdFiles, updatedFiles, skippedFiles};
    }

    // A package.json's own "type": "module" makes Node treat dist/index.js as ESM.  The scaffolded
    // source and tsconfig must agree with that: rendering the traditional CommonJS `export = game`
    // source and "module": "CommonJS" config into an ESM host produces a package that compiles but
    // then fails at load time with "require/exports is not defined in ES module scope".  Detect the
    // host module shape before writing anything, and refuse an existing incompatible tsconfig with a
    // concrete remedy rather than leaving a half-working package behind.  Projects without an explicit
    // package type keep the long-standing CommonJS scaffold, including when they already have a
    // NodeNext tsconfig (NodeNext compiles a CJS package's `export =` source to CJS correctly).
    private resolveModuleFormat(projectRoot: string, existingPkg: PackageJsonLike): PackageModuleFormat {
        const packageIsEsm = existingPkg.type === "module";
        const tsconfigPath = path.join(projectRoot, "tsconfig.json");
        if (!fs.existsSync(tsconfigPath)) {
            return packageIsEsm ? "esm" : "cjs";
        }

        let text: string;
        try {
            text = fs.readFileSync(tsconfigPath, "utf-8");
        } catch {
            return packageIsEsm ? "esm" : "cjs";
        }
        const declaredModule = (/"module"\s*:\s*"([^"]+)"/i).exec(text)?.[1]?.toLowerCase();
        if (packageIsEsm) {
            const explicitlyCommonJs = declaredModule === undefined ? false : (/^(commonjs|node10|node)$/).test(declaredModule);
            // An "extends" base may supply the module, so a missing local value is not evidence of
            // CommonJS; let the build/verify phase diagnose that rather than refusing a valid setup.
            const missingWithoutExtends = declaredModule === undefined && !((/"extends"\s*:/).test(text));
            if (explicitlyCommonJs || missingWithoutExtends) {
                throw new Error(
                    `Cannot initialize "${projectRoot}": package.json declares "type": "module", but ` +
                        `tsconfig.json ${declaredModule === undefined ? "does not declare an ESM \"module\"" : `declares "module": "${declaredModule}"`}. ` +
                        `Set "module" and "moduleResolution" to "NodeNext" (or another ES module target), then run "pokie init" again.`,
                );
            }
        }
        return packageIsEsm ? "esm" : "cjs";
    }

    private assertEsmEntryModule(projectRoot: string): void {
        const entryPath = path.join(projectRoot, "src", "index.ts");
        if (!fs.existsSync(entryPath) || !fs.statSync(entryPath).isFile()) return;
        const source = fs.readFileSync(entryPath, "utf-8");
        if ((/(^|[^A-Za-z0-9_$])export\s*=/).test(source)) {
            throw new Error(
                `Cannot initialize "${projectRoot}": package.json declares "type": "module", but ` +
                    "src/index.ts uses the CommonJS `export = game` form. Change it to `export default game` " +
                    "(and keep the same game object), then run \"pokie init\" again.",
            );
        }
    }

    // Check every directory we must create into before package.json is patched. In particular, a
    // pre-existing plain file named "src" used to fail only after package.json had been rewritten,
    // leaving an init attempt half-applied. Existing source files remain safe and are still skipped;
    // only a shape that cannot contain src/index.ts is refused up front with a useful diagnosis.
    private assertWritableProjectRoot(projectRoot: string): void {
        if (fs.existsSync(projectRoot) && !fs.statSync(projectRoot).isDirectory()) {
            throw new Error(`Cannot initialize "${projectRoot}": it is not a directory.`);
        }

        const sourceDirectory = path.join(projectRoot, "src");
        if (fs.existsSync(sourceDirectory) && !fs.statSync(sourceDirectory).isDirectory()) {
            throw new Error(`Cannot initialize "${projectRoot}": "${sourceDirectory}" is not a directory.`);
        }
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
