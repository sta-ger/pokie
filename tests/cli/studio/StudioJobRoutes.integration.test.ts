import fs from "fs";
import os from "os";
import path from "path";
import {StudioBlueprintService} from "../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioHomeService} from "../../../cli/studio/home/StudioHomeService.js";
import {FileStudioJobRepository} from "../../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../../cli/studio/jobs/StudioJobService.js";
import {StudioServer} from "../../../cli/studio/StudioServer.js";

async function get(url: string): Promise<{status: number; body: unknown}> {
    const response = await fetch(url);
    return {status: response.status, body: await response.json()};
}

describe("Studio common job routes", () => {
    let directory: string;
    let server: StudioServer | undefined;

    beforeEach(() => {
        directory = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-studio-common-job-routes-"));
    });
    afterEach(async () => {
        await server?.stop();
        fs.rmSync(directory, {recursive: true, force: true});
    });

    it("lists only the active project's durable common records", async () => {
        let nextId = 0;
        const jobs = new StudioJobService(new FileStudioJobRepository(path.join(directory, "jobs")), () => 100, () => `job-${++nextId}`);
        const started = jobs.start({projectId: "/project-a", operation: "certification-validate", request: {bundleDir: "bundle"}, conflictKey: "validation:/project-a/bundle"});
        if (started.status !== "created") throw new Error("expected a common Studio job");
        jobs.complete(started.job.id, {summary: "validated"});
        jobs.start({projectId: "/project-b", operation: "certification-validate", request: {bundleDir: "bundle"}, conflictKey: "validation:/project-b/bundle"});

        const home = new StudioHomeService("1.3.0");
        server = new StudioServer({
            pokieVersion: "1.3.0",
            host: "127.0.0.1",
            port: 0,
            studioRoot: directory,
            homeService: home,
            blueprintService: new StudioBlueprintService("1.3.0", directory, home),
            initialContext: {mode: "project", projectRoot: "/project-a"},
            jobService: jobs,
        });
        const address = await server.start();

        await expect(get(`http://${address.host}:${address.port}/api/project/jobs`)).resolves.toEqual({
            status: 200,
            body: {jobs: [expect.objectContaining({id: "job-1", projectId: "/project-a", status: "completed"})]},
        });
    });
});
