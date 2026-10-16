import fs from "fs";
import os from "os";
import path from "path";
import {MathDefinitionSourceReader, compareMathDefinitions, type MathDefinitionDiff} from "@fromstan/pokie";
import {StudioServer} from "../../../cli/studio/StudioServer.js";
import {StudioHomeService} from "../../../cli/studio/home/StudioHomeService.js";
import {StudioBlueprintService} from "../../../cli/studio/blueprint/StudioBlueprintService.js";
import {InMemoryRecentProjectsRepository} from "../../../cli/studio/InMemoryRecentProjectsRepository.js";
import {InMemoryStudioProjectRegistry} from "../../../cli/studio/InMemoryStudioProjectRegistry.js";
import {StudioProjectRegistrationService} from "../../../cli/studio/StudioProjectRegistrationService.js";
import {FileStudioJobRepository} from "../../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../../cli/studio/jobs/StudioJobService.js";
import {DiffCommand} from "../../../cli/commands/DiffCommand.js";
import {fractionalBetBlueprint} from "../../fixtures/math/FractionalBetFixture.js";
import {
    runtimeSnapshotNames,
    writeDescriptorPackage,
    writePausedDescriptorPackage,
} from "../../v2/fixtures/PackageExtractionFixture.js";

describe("definition comparison public Studio route", () => {
    let root: string, left: string, right: string, server: StudioServer, url: string;
    const post = async (body: unknown) => {
        const response = await fetch(url + "/api/math-definition-diff/preview", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify(body),
        });
        return {status: response.status, body: (await response.json()) as MathDefinitionDiff};
    };
    beforeEach(async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "definition-routes-"));
        left = path.join(root, "left.blueprint.json");
        right = path.join(root, "right.blueprint.json");
        fs.writeFileSync(left, JSON.stringify(fractionalBetBlueprint([0.05, 7.5, 1e-7], true)));
        const model = fractionalBetBlueprint([0.05, 7.5, 1e-7], true);
        model.paytable.A[3] = 7.5;
        fs.writeFileSync(right, JSON.stringify(model));
        const homeService = new StudioHomeService("1.3.0", new InMemoryRecentProjectsRepository());
        server = new StudioServer({
            pokieVersion: "1.3.0",
            host: "127.0.0.1",
            port: 0,
            studioRoot: root,
            homeService,
            blueprintService: new StudioBlueprintService("1.3.0", root, homeService),
            jobService: new StudioJobService(new FileStudioJobRepository(path.join(root, "jobs"))),
            projectRegistrationService: new StudioProjectRegistrationService(new InMemoryStudioProjectRegistry()),
        });
        const address = await server.start();
        url = `http://${address.host}:${address.port}`;
    });
    afterEach(async () => {
        await server.stop();
        fs.rmSync(root, {recursive: true, force: true});
        jest.restoreAllMocks();
    });

    it("returns structurally identical CLI JSON and Studio results for saved sources and custom boundaries", async () => {
        const custom = writeDescriptorPackage(root);
        for (const [a, b] of [
            [left, right],
            [left, left],
            [custom, custom],
            [left, custom],
        ]) {
            const api = await post({leftPath: a, rightPath: b, revision: 0});
            expect(api.status).toBe(200);
            const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
            try {
                await new DiffCommand().run([a, b, "--comparison", "definition", "--format", "json"]);
                expect(log).toHaveBeenCalledTimes(1);
                expect(JSON.parse(log.mock.calls[0][0])).toEqual(api.body);
            } finally {
                log.mockRestore();
            }
        }
    });
    it("shares corrected metadata/default semantics and unknown custom authority with CLI and the direct API", async () => {
        const model = {...fractionalBetBlueprint([0.05], true), rows: 2, winModel: {type: "ways" as const},
            betModes: [{id: "base", runtimeType: "base" as const, isDefault: true}]};
        fs.writeFileSync(left, JSON.stringify(model));
        fs.writeFileSync(right, JSON.stringify({...model, paylines: [[1, 1, 1]], betModes: [
            {...model.betModes[0], label: "Display only", targetRtp: 0.96},
        ]}));
        const custom = writeDescriptorPackage(root, {model: {...model, winModel: {type: "ways"}, paylines: undefined}, descriptorBody:
            'return {descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model, maxWinPolicy: {type: "unknown", authority: "custom cap"}, unsupported: [{path: "paylines", code: "custom-lines", message: "Unknown custom evaluator"}]};',});
        for (const [a, b] of [[left, right], [custom, left]]) {
            const result = await post({leftPath: a, rightPath: b, revision: 0});
            expect(result.status).toBe(200);
            expect(result.body).toEqual(await compareMathDefinitions(a, b));
            const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
            try {
                await new DiffCommand().run([a, b, "--comparison", "definition", "--format", "json"]);
                expect(JSON.parse(log.mock.calls[0][0])).toEqual(result.body);
            } finally {
                log.mockRestore();
            }
            if (a === left) {
                expect(result.body.status).toBe("different");
                expect(result.body.changes.every(change => !change.mathematical)).toBe(true);
            } else {
                expect(result.body.status).toBe("partial");
                expect(result.body.left.effective).not.toHaveProperty("paylines");
                expect(result.body.changes.filter(change => change.path.startsWith("/paylines"))
                    .every(change => !change.mathematical && change.before.provenance.status === "unknown")).toBe(true);
            }
        }
    });

    it("compares saved versus draft without writes, builds or session construction", async () => {
        const bytes = fs.readFileSync(left);
        const draft = fractionalBetBlueprint([0.05, 7.5, 1e-7], true);
        draft.paytable.A[3] = 0;
        const result = await post({leftPath: left, draft, revision: 9});
        expect(result.body).toEqual(await compareMathDefinitions(left, {kind: "blueprint", model: draft}));
        expect(result.body.status).toBe("different");
        expect(fs.readFileSync(left)).toEqual(bytes);
        expect(
            fs
                .readdirSync(root)
                .filter((name) => !name.startsWith("jobs"))
                .sort(),
        ).toEqual(["left.blueprint.json", "right.blueprint.json"]);
    });
    it.each([
        null,
        [],
        {},
        {leftPath: "x", rightPath: "y", draft: {}, revision: 0},
        {leftPath: "x", rightPath: "y", revision: -1},
        {leftPath: "x", rightPath: "y", revision: 0.5},
        {leftPath: "x", rightPath: "y", revision: 0, save: true},
        {leftPath: "x", revision: 0, draft: null},
    ])("validates request %j before acquiring sources", async (body) => {
        const read = jest.spyOn(MathDefinitionSourceReader.prototype, "read");
        expect((await post(body)).status).toBe(400);
        expect(read).not.toHaveBeenCalled();
    });
    it("rejects stale project binding before source acquisition", async () => {
        expect((await post({projectRoot: left, leftPath: left, rightPath: right, revision: 0})).status).toBe(409);
    });
    it("returns distinguishable invalid, unsupported and failed states", async () => {
        fs.writeFileSync(right, JSON.stringify({...fractionalBetBlueprint(), availableBets: ["0.05"]}));
        expect((await post({leftPath: left, rightPath: right, revision: 0})).body.status).toBe("invalid");
        expect((await post({leftPath: left, rightPath: path.join(root, "missing"), revision: 0})).body.status).toBe(
            "failed",
        );
        const custom = writeDescriptorPackage(root, {legacy: true});
        expect((await post({leftPath: custom, rightPath: custom, revision: 0})).body.status).toBe("partial");
    });
    it("drains package extraction on disconnect and shutdown and removes only owned snapshots", async () => {
        const fixture = writePausedDescriptorPackage(root, undefined, {pauseAtRead: 1});
        const baseline = runtimeSnapshotNames(fixture.source);
        const controller = new AbortController();
        const pending = fetch(url + "/api/math-definition-diff/preview", {
            method: "POST",
            headers: {"Content-Type": "application/json"},
            body: JSON.stringify({leftPath: fixture.source, rightPath: left, revision: 0}),
            signal: controller.signal,
        }).catch((error) => error);
        try {
            await fixture.readStarted;
            controller.abort();
            const stopping = server.stop();
            fixture.settle();
            await pending;
            await stopping;
            expect(runtimeSnapshotNames(fixture.source)).toEqual(baseline);
            expect(fs.existsSync(fixture.source)).toBe(true);
        } finally {
            fixture.restore();
        }
    });
});
