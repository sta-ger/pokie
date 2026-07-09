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
                },
                include: ["src"],
            },
            null,
            4,
        ) + "\n"
    );
}
