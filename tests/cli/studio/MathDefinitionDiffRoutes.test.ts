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
import {dispatch} from "../../../cli/dispatch.js";
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

    it.each(["exact reels", "inventory", "metadata cost", "diagnostics", "container authority", "invalid cost"])(
        "shares %s results between direct API, dispatcher and saved/draft Studio previews", async field => {
            const model = {...fractionalBetBlueprint([0.05], true), betModes: [{id: "legacy", costMultiplier: 2}]};
            if (field === "diagnostics") {
                model.symbols.push("C");
                model.paytable = {};
            }
            if (field === "container authority") model.paytable = {};
            const changed = JSON.parse(JSON.stringify(model)) as typeof model;
            if (field === "exact reels") {
                changed.reelSequences = changed.reelStrips!.map(symbols => ({type: "exact", symbols}));
                Reflect.deleteProperty(changed, "reelStrips");
            }
            if (field === "inventory") changed.symbols.reverse();
            if (field === "metadata cost") changed.betModes[0].costMultiplier = 7.5;
            if (field === "diagnostics") changed.paytable.A = {3: 0};
            if (field === "invalid cost") Reflect.set(changed.betModes[0], "costMultiplier", "7.5");
            fs.writeFileSync(left, JSON.stringify(model));
            fs.writeFileSync(right, JSON.stringify(changed));
            const target = field === "container authority" ? writeDescriptorPackage(root, {model, descriptorBody:
                'return {descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "generated", model};',}) : right;
            for (const [a, b] of [[left, target], [target, left]]) {
                const result = await post({leftPath: a, rightPath: b, revision: 0});
                expect(result.status).toBe(200);
                expect(result.body).toEqual(await compareMathDefinitions(a, b));
                const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
                try {
                    expect(await dispatch([new DiffCommand()], ["node", "pokie", "diff", a, b, "--ci", "--format", "json"]))
                        .toBe(field === "invalid cost" ? 2 : 0);
                    expect(JSON.parse(log.mock.calls[0][0])).toEqual(result.body);
                } finally {
                    log.mockRestore(); 
                }
                if (field === "container authority") expect(result.body.changes).toContainEqual(expect.objectContaining({
                    path: "/paytable", classification: "provenance", mathematical: false,
                }));
                if (field === "diagnostics") expect(result.body.changes.filter(change => change.path.includes("blueprint-symbol-missing-payout"))).toHaveLength(1);
            }
            const draft = await post({leftPath: left, draft: changed, revision: 1});
            expect(draft.body).toEqual(await compareMathDefinitions(left, {kind: "blueprint", model: changed}));
            if (field === "invalid cost") {
                expect(draft.body.right.diagnostics).toContainEqual(expect.objectContaining({path: "/betModes/0/costMultiplier", severity: "error"}));
                for (const revision of [2, 3]) expect((await post({leftPath: left, draft: model, revision})).body.status).toBe("identical");
            }
        },
    );

    it.each(["betModes[0].costMultiplier", "/betModes/0/costMultiplier", "literal symbol", "retained declarations"])(
        "shares segment authority and retained provenance for %s through saved-source CLI/Studio", async field => {
            const model = {...fractionalBetBlueprint([0.05], true), betModes: [{id: "custom", costMultiplier: 2}]};
            if (field === "literal symbol") {
                model.symbols.push("A.B");
                model.paytable["A.B"] = {3: 2};
            }
            if (field === "retained declarations") {
                model.reelSequences = model.reelStrips!.map(symbols => ({type: "exact", symbols}));
                Reflect.deleteProperty(model, "reelStrips");
                Reflect.deleteProperty(model.paytable, "B");
            }
            const changed = JSON.parse(JSON.stringify(model)) as typeof model;
            if (field === "literal symbol") changed.paytable["A.B"][3] = 9;
            else if (field !== "retained declarations") changed.betModes[0].costMultiplier = 7.5;
            const declaration = (boundary: string) => `return {descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "custom", model,
                maxWinPolicy: {type: "none", scope: "logical-round", authority: "declared policy"},
                unsupported: [{path: ${JSON.stringify(boundary)}, code: "custom-field", message: "Unavailable custom collaborator"}]};`;
            const a = field === "retained declarations" ? left : writeDescriptorPackage(root, {name: "authority-left", model,
                descriptorBody: declaration(field === "literal symbol" ? "paytable.A" : field)});
            const b = writeDescriptorPackage(root, {name: "authority-right", model: changed,
                descriptorBody: field === "retained declarations"
                    ? 'return {descriptorVersion: 1, blueprintSchemaVersion: 1, sourceKind: "generated", model, unsupported: [{path: "/mechanics/freeGames", code: "custom-feature", message: "Unavailable feature"}]};'
                    : declaration(field === "literal symbol" ? "paytable.A" : field)});
            fs.writeFileSync(left, JSON.stringify(model));
            for (const [before, after] of [[a, b], [b, a]]) {
                const result = await post({leftPath: before, rightPath: after, revision: 0});
                expect(result.status).toBe(200);
                expect(result.body).toEqual(await compareMathDefinitions(before, after));
                const log = jest.spyOn(console, "log").mockImplementation(() => undefined);
                try {
                    expect(await dispatch([new DiffCommand()], ["node", "pokie", "diff", before, after, "--ci", "--format", "json"]))
                        .toBe(2);
                    expect(JSON.parse(log.mock.calls[0][0])).toEqual(result.body);
                } finally {
                    log.mockRestore();
                }
                if (field === "retained declarations") {
                    for (const path of ["/reelSequences", "/reelSequences/0", "/reelSequences/0/type", "/reelSequences/0/symbols"]) {
                        expect(result.body.changes).toContainEqual(expect.objectContaining({path, classification: "provenance", mathematical: false}));
                    }
                    for (const path of ["/paytable/B", "/paytable/A/2", "/mechanics/freeGames"]) {
                        expect(result.body.changes).toContainEqual(expect.objectContaining({path, classification: "provenance", mathematical: false,
                            before: expect.objectContaining({present: false}), after: expect.objectContaining({present: false}),}));
                    }
                } else expect(result.body.changes).toContainEqual(expect.objectContaining({
                    path: field === "literal symbol" ? "/paytable/A.B/3" : "/betModes/0/costMultiplier",
                    mathematical: field === "literal symbol",
                    after: expect.objectContaining({provenance: expect.objectContaining({status: field === "literal symbol" ? "authored" : "unknown"})}),
                }));
            }
        },
    );

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
