import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import {StudioBlueprintService} from "../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../../cli/studio/home/StudioHomeService.js";
import {PokiePathResolver} from "../../../cli/paths/PokiePathResolver.js";
import {FileStudioJobRepository} from "../../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../../cli/studio/jobs/StudioJobService.js";
import {StudioServer} from "../../../cli/studio/StudioServer.js";

describe("Studio remote origin trust policy", () => {
    // Every listener owns its durable jobs, including when Jest runs this file
    // beside suites that deliberately leave jobs active or require recovery.
    function createIsolatedJobService(root: string): StudioJobService {
        return new StudioJobService(new FileStudioJobRepository(path.join(root, "jobs")));
    }

    function rawPost(port: number, host: string, origin: string): Promise<{status: number; body: string}> {
        return new Promise((resolve, reject) => {
            const request = http.request({hostname: "127.0.0.1", port, path: "/api/home/projects/open", method: "POST", headers: {Host: host, Origin: origin, "Content-Type": "application/json"}}, (response) => {
                let body = "";
                response.setEncoding("utf8");
                response.on("data", (chunk: string) => {
                    body += chunk;
                });
                response.on("end", () => resolve({status: response.statusCode ?? 0, body}));
            });
            request.on("error", reject);
            request.end(JSON.stringify({projectRoot: "."}));
        });
    }

    it.each(["unrelated", "owned"] as const)("isolates %s active jobs without weakening shutdown cleanup", async (ownership) => {
        const studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-trust-jobs-"));
        fs.writeFileSync(path.join(studioRoot, "index.html"), "<html>studio</html>");
        // Redirect the production default into this fixture: removing the explicit
        // per-listener job service must reproduce the saved shutdown failure.
        const appData = path.join(studioRoot, "profile");
        const defaultDirectory = jest.spyOn(PokiePathResolver.prototype, "resolveAppDataDirectory").mockReturnValue(appData);
        const jobs = createIsolatedJobService(studioRoot);
        const repository = new FileStudioJobRepository(path.join(studioRoot, "jobs"));
        const otherRepository = new FileStudioJobRepository(path.join(appData, "studio-jobs"));
        const otherJobs = new StudioJobService(otherRepository);
        const activeJobs = ownership === "owned" ? jobs : otherJobs;
        const home = new StudioHomeService("1.3.0");
        const server = new StudioServer({pokieVersion: "1.3.0", host: "127.0.0.1", port: 0, studioRoot, jobService: jobs, homeService: home, blueprintService: new StudioBlueprintService("1.3.0", studioRoot, home)});
        let stopAttempted = false;
        try {
            const address = await server.start();
            // Admit after both services exist, just as another gate worker can
            // publish an active record after this listener's restart reconciliation.
            const started = activeJobs.start({projectId: studioRoot, operation: "project-open-materialization", request: {}, conflictKey: studioRoot});
            expect(started.status).toBe("created");
            if (started.status !== "created") throw new Error("Expected a new fixture job.");
            const running = activeJobs.markRunning(started.job.id);
            await expect(rawPost(address.port, "untrusted.audit.invalid", "http://untrusted.audit.invalid")).resolves.toEqual(expect.objectContaining({status: 403}));
            stopAttempted = true;
            if (ownership === "unrelated") {
                await expect(server.stop()).resolves.toBeUndefined();
                expect(repository.getProcessState()?.status).toBe("gracefully-stopped");
                expect(otherRepository.get(started.job.id)).toEqual(running);
            } else {
                await expect(server.stop()).rejects.toThrow("Studio shutdown could not confirm executor cleanup. Retained jobs require recovery.");
                expect(repository.getProcessState()?.status).toBe("running");
                expect(repository.get(started.job.id)).toMatchObject({status: "recovery-required", recovery: {action: "retry"}});
            }
        } finally {
            try {
                if (!stopAttempted) await server.stop();
            } finally {
                defaultDirectory.mockRestore();
                fs.rmSync(studioRoot, {recursive: true, force: true});
            }
        }
    });

    it("rejects a hostile same-Origin authority from a real loopback peer", async () => {
        const studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-loopback-trust-"));
        fs.writeFileSync(path.join(studioRoot, "index.html"), "<html>studio</html>");
        const home = new StudioHomeService("1.3.0");
        const server = new StudioServer({pokieVersion: "1.3.0", host: "127.0.0.1", port: 0, studioRoot, jobService: createIsolatedJobService(studioRoot), homeService: home, blueprintService: new StudioBlueprintService("1.3.0", studioRoot, home)});
        try {
            const address = await server.start();
            const hostileOrigin = `http://untrusted.audit.invalid:${address.port}`;
            await expect(rawPost(address.port, `untrusted.audit.invalid:${address.port}`, hostileOrigin)).resolves.toEqual(expect.objectContaining({status: 403}));
            const context = await fetch(`http://127.0.0.1:${address.port}/api/context`).then((response) => response.json()) as {mode: string};
            expect(context.mode).toBe("home");
        } finally {
            try {
                await server.stop();
            } finally {
                fs.rmSync(studioRoot, {recursive: true, force: true});
            }
        }
    });

    it("does not accept an IPv6 Host/Origin spoof against a v4-only listener", async () => {
        const studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-address-family-trust-"));
        fs.writeFileSync(path.join(studioRoot, "index.html"), "<html>studio</html>");
        const home = new StudioHomeService("1.3.0");
        const server = new StudioServer({pokieVersion: "1.3.0", host: "127.0.0.1", port: 0, studioRoot, jobService: createIsolatedJobService(studioRoot), homeService: home, blueprintService: new StudioBlueprintService("1.3.0", studioRoot, home)});
        try {
            const address = await server.start();
            const ipv6Origin = `http://[::1]:${address.port}`;
            await expect(rawPost(address.port, `[::1]:${address.port}`, ipv6Origin)).resolves.toEqual(expect.objectContaining({status: 403}));
        } finally {
            try {
                await server.stop();
            } finally {
                fs.rmSync(studioRoot, {recursive: true, force: true});
            }
        }
    });

    it("permits only an explicitly configured reverse-proxy browser authority", async () => {
        const studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-proxy-trust-"));
        fs.writeFileSync(path.join(studioRoot, "index.html"), "<html>studio</html>");
        const trustedOrigin = "http://studio.proxy.test:4310";
        const home = new StudioHomeService("1.3.0");
        const server = new StudioServer({
            pokieVersion: "1.3.0",
            host: "127.0.0.1",
            port: 0,
            studioRoot,
            jobService: createIsolatedJobService(studioRoot),
            trustedOrigins: [trustedOrigin],
            homeService: home,
            blueprintService: new StudioBlueprintService("1.3.0", studioRoot, home),
        });
        try {
            const address = await server.start();
            const response = await rawPost(address.port, "studio.proxy.test:4310", trustedOrigin);
            expect(response.status).not.toBe(403);
        } finally {
            try {
                await server.stop();
            } finally {
                fs.rmSync(studioRoot, {recursive: true, force: true});
            }
        }
    });

    it("does not treat a regex-valid Host plus matching Origin as remote authority", async () => {
        const studioRoot = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-trust-"));
        fs.writeFileSync(path.join(studioRoot, "index.html"), "<html>studio</html>");
        fs.writeFileSync(path.join(studioRoot, "main.js"), "");
        fs.writeFileSync(path.join(studioRoot, "style.css"), "");
        const home = new StudioHomeService("1.3.0");
        const server = new StudioServer({
            pokieVersion: "1.3.0",
            host: "127.0.0.1",
            port: 0,
            studioRoot,
            jobService: createIsolatedJobService(studioRoot),
            homeService: home,
            blueprintService: new StudioBlueprintService("1.3.0", studioRoot, home),
            isLoopbackRequest: () => false,
        });
        try {
            const address = await server.start();
            const origin = `http://${address.host}:${address.port}`;
            const response = await fetch(`${origin}/api/home/projects/open`, {
                method: "POST",
                headers: {"Content-Type": "application/json", Origin: origin},
                body: JSON.stringify({projectRoot: "."}),
            });

            expect(response.status).toBe(403);
            await expect(response.json()).resolves.toEqual({error: "Remote Studio API writes require an explicitly trusted Studio origin."});
        } finally {
            try {
                await server.stop();
            } finally {
                fs.rmSync(studioRoot, {recursive: true, force: true});
            }
        }
    });
});
