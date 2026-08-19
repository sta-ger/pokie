import {spawn} from "node:child_process";
import {createServer} from "vite";

const STUDIO_URL = "http://127.0.0.1:3200";
const STUDIO_HEALTH_URL = `${STUDIO_URL}/api/context`;
const STUDIO_START_TIMEOUT_MS = 5000;
const STUDIO_START_POLL_MS = 50;

const studioProcess = spawn(process.execPath, ["dist/cli/pokie.js", "studio", "--no-open", "--host", "127.0.0.1", "--port", "3200"], {
    stdio: "inherit",
});

let viteServer;
let stopping = false;

async function stop(exitCode) {
    if (stopping) {
        return;
    }
    stopping = true;
    await viteServer?.close();
    if (studioProcess.exitCode === null && !studioProcess.killed) {
        studioProcess.kill("SIGTERM");
    }
    process.exitCode = exitCode;
}

async function waitForStudio() {
    const deadline = Date.now() + STUDIO_START_TIMEOUT_MS;
    while (Date.now() < deadline) {
        if (studioProcess.exitCode !== null) {
            throw new Error(`POKIE Studio stopped before it became available (exit ${studioProcess.exitCode}).`);
        }
        try {
            const response = await fetch(STUDIO_HEALTH_URL);
            if (response.ok) {
                return;
            }
        } catch {
            // The process is still starting; the next short poll either reaches it or the timeout reports the failure.
        }
        await new Promise((resolve) => setTimeout(resolve, STUDIO_START_POLL_MS));
    }
    throw new Error(`Timed out waiting for POKIE Studio at ${STUDIO_URL}.`);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
        void stop(0);
    });
}

try {
    await waitForStudio();
    viteServer = await createServer({configFile: "cli/studio-client/vite.config.ts"});
    await viteServer.listen();
    viteServer.printUrls();
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    await stop(1);
}
