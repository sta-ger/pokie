import {defineConfig, devices} from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Deliberately outside the repository and its node_modules cache: Studio's managed-project guard
// rejects temp/cache roots, and a normal Home child is the same shape a real user gets.
const e2eHome = path.join(os.homedir(), ".pokie-e2e-home");
const e2eTmp = path.join(e2eHome, "tmp");
fs.rmSync(e2eHome, {recursive: true, force: true});
fs.mkdirSync(e2eTmp, {recursive: true});

const port = Number(process.env.POKIE_E2E_PORT ?? 4487);
const executablePath = process.env.POKIE_E2E_CHROMIUM;

export default defineConfig({
    testDir: "./tests/e2e",
    outputDir: "node_modules/.cache/pokie-e2e-results",
    fullyParallel: false,
    workers: 1,
    timeout: 120_000,
    expect: {timeout: 15_000},
    reporter: process.env.CI === undefined ? "line" : [["line"], ["html", {open: "never", outputFolder: "node_modules/.cache/pokie-e2e-report"}]],
    globalTeardown: "./tests/e2e/globalTeardown.ts",
    use: {
        baseURL: `http://127.0.0.1:${port}`,
        viewport: {width: 1440, height: 1000},
        trace: "retain-on-failure",
        screenshot: "only-on-failure",
        ...(executablePath === undefined ? {} : {launchOptions: {executablePath}}),
    },
    webServer: {
        command: `node dist/cli/pokie.js --no-open --port ${port}`,
        url: `http://127.0.0.1:${port}/api/health`,
        // Never attach to a developer's real Studio instance: this suite owns a disposable HOME.
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
            HOME: e2eHome,
            XDG_CONFIG_HOME: path.join(e2eHome, ".config"),
            XDG_DATA_HOME: path.join(e2eHome, ".local", "share"),
            XDG_STATE_HOME: path.join(e2eHome, ".local", "state"),
            TMPDIR: e2eTmp,
        },
    },
    projects: [
        {
            name: "chromium",
            use: {...devices["Desktop Chrome"]},
        },
    ],
});
