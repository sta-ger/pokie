import fs from "fs";
import os from "os";
import path from "path";
import {AdvancedModelSourceValidator} from "../../../src/validation/AdvancedModelSourceValidator.js";
import {StudioServer} from "../../../cli/studio/StudioServer.js";
import {StudioHomeService} from "../../../cli/studio/home/StudioHomeService.js";
import {StudioBlueprintService} from "../../../cli/studio/blueprint/StudioBlueprintService.js";
import {InMemoryRecentProjectsRepository} from "../../../cli/studio/InMemoryRecentProjectsRepository.js";
import {InMemoryStudioProjectRegistry} from "../../../cli/studio/InMemoryStudioProjectRegistry.js";
import {StudioProjectRegistrationService} from "../../../cli/studio/StudioProjectRegistrationService.js";
import {FileStudioJobRepository} from "../../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../../cli/studio/jobs/StudioJobService.js";
import {ValidateCommand} from "../../../cli/commands/ValidateCommand.js";
import {fractionalBetBlueprint} from "../../fixtures/math/FractionalBetFixture.js";
import type {AdvancedModelValidationReport} from "../../../src/validation/AdvancedModelValidation.js";

it("shares candidate-bound library, draft Studio and CLI JSON reports, with corrected retries and read-only bytes", async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "advanced-routes-"));
    const file = path.join(root, "model.blueprint.json");
    const model = fractionalBetBlueprint([0.05, 7.5, 1e-7], true);
    const bytes = JSON.stringify(model);
    fs.writeFileSync(file, bytes);
    const home = new StudioHomeService("1.3.0", new InMemoryRecentProjectsRepository());
    const server = new StudioServer({initialContext: {mode: "project", projectRoot: file}, pokieVersion: "1.3.0", host: "127.0.0.1", port: 0, studioRoot: root, homeService: home,
        blueprintService: new StudioBlueprintService("1.3.0", root, home), jobService: new StudioJobService(new FileStudioJobRepository(path.join(root, "jobs"))),
        projectRegistrationService: new StudioProjectRegistrationService(new InMemoryStudioProjectRegistry())});
    try {
        const address = await server.start();
        const url = `http://${address.host}:${address.port}`;
        const post = async (blueprint: unknown) => {
            const response = await fetch(url + "/api/home/blueprints/validate", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({blueprint})});
            expect(response.status).toBe(200);
            return response.json() as Promise<{advanced: AdvancedModelValidationReport}>;
        };
        const api = await new AdvancedModelSourceValidator().validate(file);
        expect(api).toMatchObject({status: "complete", verdict: "proved-within-assumptions"});
        expect((await post(model)).advanced).toEqual(api);
        const saved = await fetch(url + "/api/project/validate");
        expect(saved.status).toBe(200);
        expect((await saved.json() as {advanced: AdvancedModelValidationReport}).advanced).toEqual(api);
        expect((await post({...model, reels: 0})).advanced.status).toBe("invalid");
        expect((await post(model)).advanced).toEqual(api);
        const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
        try {
            expect(await new ValidateCommand().run([file, "--format", "json"])).toBe(0);
            const cli = JSON.parse(log.mock.calls[0][0]) as {advanced: AdvancedModelValidationReport};
            expect(cli.advanced).toEqual(api);
        } finally {
            log.mockRestore();
        }
        expect(fs.readFileSync(file, "utf8")).toBe(bytes);
    } finally {
        await server.stop();
        fs.rmSync(root, {recursive: true, force: true});
    }
});
