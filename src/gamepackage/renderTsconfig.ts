export function renderTsconfig(): string {
    return (
        JSON.stringify(
            {
                compilerOptions: {
                    target: "ES2019",
                    module: "CommonJS",
                    outDir: "dist",
                    rootDir: "src",
                    strict: true,
                    esModuleInterop: true,
                    skipLibCheck: true,
                    forceConsistentCasingInFileNames: true,
                    // A failed "npm run build" (tsc exits non-zero) must never leave a stale/partial
                    // dist/index.js on disk -- GamePackagePreparer's retry semantics rely on "build"
                    // failing cleanly with no dist output at all.
                    noEmitOnError: true,
                },
                include: ["src"],
            },
            null,
            4,
        ) + "\n"
    );
}
