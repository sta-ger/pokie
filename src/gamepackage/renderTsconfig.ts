export type PackageModuleFormat = "cjs" | "esm";

export function renderTsconfig(moduleFormat: PackageModuleFormat = "cjs"): string {
    const compilerOptions = {
        target: moduleFormat === "esm" ? "ES2022" : "ES2019",
        outDir: "dist",
        rootDir: "src",
        strict: true,
        skipLibCheck: true,
        forceConsistentCasingInFileNames: true,
        // A failed "npm run build" (tsc exits non-zero) must never leave a stale/partial
        // dist/index.js on disk -- pokie init's retry semantics rely on "build"
        // failing cleanly with no dist output at all.
        noEmitOnError: true,
        ...(moduleFormat === "esm"
            ? {module: "NodeNext", moduleResolution: "NodeNext"}
            : {module: "CommonJS", esModuleInterop: true}),
    };
    return JSON.stringify({compilerOptions, include: ["src"]}, null, 4) + "\n";
}
