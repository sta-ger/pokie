import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {StudioCommand} from "../../../cli/commands/StudioCommand.js";
import {StudioServer} from "../../../cli/studio/StudioServer.js";
import {createRecommendedBlueprint} from "../../../cli/studio-client/src/domain/blueprintEditorState.js";

const REPO_ROOT = path.resolve(__dirname, "../../..");

type JsonResponse<T> = {ok: boolean; status: number; json(): Promise<T>};

function jsonRequest<T>(url: string, init?: RequestInit): Promise<JsonResponse<T>> {
    return fetch(url, {
        ...init,
        headers: {"Content-Type": "application/json", ...(init?.headers ?? {})},
    }) as unknown as Promise<JsonResponse<T>>;
}

// End-to-end at the HTTP boundary that the React Studio client actually uses: first Save from a HOME
// launch, Open, start a build job, activate it and poll it under the canonical client prefix. This is
// deliberately not a UI test; it is the regression net for the server/client route contract that the
// 2.0 cleanup broke, plus the managed-project path guard that used to reject a HOME cwd.
describe("Studio HTTP smoke", () => {
    jest.setTimeout(180_000);

    let server: StudioServer | undefined;
    let baseUrl = "";
    let tempHome = "";
    let previousCwd = "";
    const previousEnvironment: Record<string, string | undefined> = {};

    beforeAll(async () => {
        tempHome = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-smoke-"));
        previousCwd = process.cwd();
        for (const key of ["HOME", "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_STATE_HOME"]) {
            previousEnvironment[key] = process.env[key];
        }
        process.env.HOME = tempHome;
        process.env.XDG_CONFIG_HOME = path.join(tempHome, ".config");
        process.env.XDG_DATA_HOME = path.join(tempHome, ".local", "share");
        process.env.XDG_STATE_HOME = path.join(tempHome, ".local", "state");
        jest.spyOn(os, "homedir").mockReturnValue(tempHome);
        process.chdir(tempHome);

        const fakeProcess = {once: () => fakeProcess, exit: () => undefined} as unknown as NodeJS.Process;
        const command = new StudioCommand("2.0.0", REPO_ROOT, {
            createServer: (options) => {
                const created = new StudioServer(options);
                const start = created.start.bind(created);
                created.start = async () => {
                    const address = await start();
                    baseUrl = `http://${address.host}:${address.port}`;
                    return address;
                };
                server = created;
                return created;
            },
            openBrowser: () => undefined,
            studioRoot: path.join(REPO_ROOT, "cli/studio-client"),
            process: fakeProcess,
        });
        await command.run(["--port", "0", "--no-open"]);
    });

    afterAll(async () => {
        await server?.stop().catch(() => undefined);
        process.chdir(previousCwd);
        for (const [key, value] of Object.entries(previousEnvironment)) {
            if (value === undefined) Reflect.deleteProperty(process.env, key);
            else process.env[key] = value;
        }
        jest.restoreAllMocks();
        fs.rmSync(tempHome, {recursive: true, force: true});
    });

    it("saves from HOME, opens the project and completes a build through the client job route", async () => {
        const saved = await jsonRequest<{status: string; path: string}>(
            `${baseUrl}/api/home/blueprints/save-managed`,
            {method: "POST", body: JSON.stringify({blueprint: createRecommendedBlueprint()})},
        );
        const saveBody = await saved.json() as {status: string; path?: string; error?: string};
        if (saved.status !== 201) console.log("SAVE_MANAGED_FAILED", saved.status, saveBody);
        expect(saved.status).toBe(201);
        expect(saveBody.status).toBe("ok");
        expect(typeof saveBody.path).toBe("string");
        expect(saveBody.path!.startsWith(path.join(tempHome, "POKIE Projects"))).toBe(true);

        const opened = await jsonRequest<{status: string}>(
            `${baseUrl}/api/home/projects/open`,
            {method: "POST", body: JSON.stringify({projectRoot: saveBody.path})},
        );
        expect(opened.status).toBe(200);

        // A Studio build must not produce a file POKIE cannot reopen just because the browser client skipped
        // BuildCommand's own --out suffix boundary. Preview is the pre-build check the Build/Export tab uses.
        const badSuffix = path.join(tempHome, "par-without-suffix");
        const badSuffixPreview = await jsonRequest<{status: string; message?: string}>(
            `${baseUrl}/api/project/build/preview`,
            {method: "POST", body: JSON.stringify({target: "parWorkbook", outDir: badSuffix})},
        );
        expect(badSuffixPreview.status).toBe(200);
        expect(await badSuffixPreview.json()).toEqual(expect.objectContaining({
            status: "error",
            message: expect.stringContaining('ending in ".xlsx"'),
        }));
        expect(fs.existsSync(badSuffix)).toBe(false);

        const folderDestination = path.join(tempHome, "folder-named-like-par.xlsx");
        fs.mkdirSync(folderDestination);
        const folderPreview = await jsonRequest<{status: string; message?: string}>(
            `${baseUrl}/api/project/build/preview`,
            {method: "POST", body: JSON.stringify({target: "parWorkbook", outDir: folderDestination})},
        );
        expect(folderPreview.status).toBe(200);
        expect(await folderPreview.json()).toEqual(expect.objectContaining({
            status: "error",
            message: expect.stringContaining("is a folder, not a file"),
        }));

        const started = await jsonRequest<{status: string; job: {id: string; status: string}}>(
            `${baseUrl}/api/project/build/build`,
            {method: "POST", body: JSON.stringify({target: "parWorkbook"})},
        );
        expect(started.status).toBe(202);
        const {job} = await started.json();
        expect(job.status).toBe("queued");

        const activated = await jsonRequest<{id: string; status: string}>(
            `${baseUrl}/api/project/build/build/${encodeURIComponent(job.id)}/activate`,
            {method: "POST"},
        );
        expect(activated.status).toBe(200);

        let terminal: {status: string; result?: {outputPath?: string}} | undefined;
        for (let attempt = 0; attempt < 120; attempt += 1) {
            const polled = await jsonRequest<{status: string; result?: {outputPath?: string}}>(
                `${baseUrl}/api/project/build/build/${encodeURIComponent(job.id)}`,
            );
            expect(polled.status).toBe(200);
            terminal = await polled.json();
            if (["completed", "failed", "cancelled"].includes(terminal.status)) break;
            await new Promise((resolve) => {
                setTimeout(resolve, 250);
            });
        }

        expect(terminal?.status).toBe("completed");
        const outputPath = path.join(path.dirname(saveBody.path!), "parWorkbook.xlsx");
        expect(terminal?.result?.outputPath).toBe(outputPath);
        expect(fs.existsSync(outputPath)).toBe(true);
        expect(fs.statSync(outputPath).size).toBeGreaterThan(0);
    });

    it("reports a failed PAR import with a corrective next step, not a restart claim", async () => {
        const missingPath = path.join(tempHome, "missing-par-import.xlsx");
        const imported = await jsonRequest<{status: string; error?: string}>(
            `${baseUrl}/api/home/blueprints/par-import`,
            {method: "POST", body: JSON.stringify({path: missingPath})},
        );
        expect(imported.status).toBe(200);
        expect(await imported.json()).toEqual(expect.objectContaining({status: "load-error", error: expect.stringContaining(missingPath)}));

        const listed = await jsonRequest<{jobs: Array<{operation: string; status: string; request?: {path?: string}; recovery?: {action: string; reason: string}; recoveryOnRestart?: {action: string; reason: string}}>}>(`${baseUrl}/api/home/jobs`);
        const job = (await listed.json()).jobs.find(candidate => candidate.operation === "design-par-import" && candidate.request?.path === missingPath);
        expect(job?.status).toBe("failed");
        expect(job?.recovery).toEqual({action: "rebuild", reason: "Import the same workbook again when ready; a partial import is never applied."});
        expect(job?.recoveryOnRestart?.reason).toContain("after restart");
    });

    it("refuses a second managed project with the same Game id instead of creating a suffixed duplicate", async () => {
        const saved = await jsonRequest<{status: string; path?: string; error?: string; suggestedGameId?: string}>(
            `${baseUrl}/api/home/blueprints/save-managed`,
            {method: "POST", body: JSON.stringify({blueprint: createRecommendedBlueprint()})},
        );
        const body = await saved.json();

        expect(saved.status).toBe(200);
        expect(body.status).toBe("unavailable");
        expect(body.error).toMatch(/with Game id "starter-slot" already exists/i);
        expect(body.error).toMatch(/Choose a different Game id/i);
        expect(body.suggestedGameId).toBe("starter-slot-2");
        expect(fs.existsSync(path.join(tempHome, "POKIE Projects", "starter-slot-2", "blueprint.json"))).toBe(false);
    });
});
