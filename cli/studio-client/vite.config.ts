import path from "node:path";
import {fileURLToPath} from "node:url";
import react from "@vitejs/plugin-react";
import {defineConfig} from "vite";

// Studio's frontend build root. Output is placed directly at dist/cli/studio-client, the exact path
// cli/pokie.ts's ownStudioRoot() resolves in production (see StudioServer.ts) -- this replaces the old
// "tsc + shx cp index.html/style.css" build-studio-client step; Vite emits its own hashed index.html
// and assets/ bundle instead.
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
    root: projectRoot,
    plugins: [react()],
    build: {
        outDir: path.resolve(projectRoot, "../../dist/cli/studio-client"),
        emptyOutDir: true,
        sourcemap: false,
    },
    server: {
        // Dev-only: StudioServer serves the frontend + JSON API same-origin in production, but the Vite
        // dev server needs to proxy /api to a separately-running `pokie studio` instance for local HMR
        // development (see docs/studio-frontend.md).
        proxy: {
            "/api": {
                target: "http://127.0.0.1:3200",
                changeOrigin: true,
            },
        },
    },
});
