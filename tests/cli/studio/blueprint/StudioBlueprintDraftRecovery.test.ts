import fs from "fs";
import os from "os";
import path from "path";
import {FileStudioBlueprintDraftStore} from "../../../../cli/studio/blueprint/FileStudioBlueprintDraftStore.js";
import {validateStudioBlueprintDraftSnapshot, type StudioBlueprintDraftSnapshot} from "../../../../cli/studio/blueprint/StudioBlueprintDraft.js";
import {StudioBlueprintService} from "../../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioServer} from "../../../../cli/studio/StudioServer.js";
import {StudioHomeService} from "../../../../cli/studio/home/StudioHomeService.js";
import {InMemoryRecentProjectsRepository} from "../../../../cli/studio/InMemoryRecentProjectsRepository.js";
import {InMemoryStudioProjectRegistry} from "../../../../cli/studio/InMemoryStudioProjectRegistry.js";
import {StudioProjectRegistrationService} from "../../../../cli/studio/StudioProjectRegistrationService.js";
import {StudioJobService} from "../../../../cli/studio/jobs/StudioJobService.js";
import {FileStudioJobRepository} from "../../../../cli/studio/jobs/FileStudioJobRepository.js";
import {createRecommendedBlueprint} from "../../../../cli/studio-client/src/domain/blueprintEditorState.js";
import {PokiePathResolver} from "../../../../cli/paths/PokiePathResolver.js";

const draft = {blueprint: {...createRecommendedBlueprint(), manifest: {id: "verifier-draft-recovery-updated", name: "Verifier Draft Recovery Updated", version: "0.1.0"}}};
const malformed = [
    {value: null, diagnostic: '"snapshot" must be an object.'},
    {value: {version: 0}, diagnostic: '"version" must be a draft version token or null.'},
    {value: {version: null, draft: null}, diagnostic: '"draft" must be an object.'},
    {value: {version: null, draft: {blueprint: []}}, diagnostic: '"draft.blueprint" must be a JSON object.'},
    {value: {version: null, draft: {blueprint: {}, importedFromParSheetPath: 7}}, diagnostic: '"draft.importedFromParSheetPath" must be a string when given.'},
];

describe("profile-backed Design recovery authority", () => {
    let root: string, file: string, store: FileStudioBlueprintDraftStore, server: StudioServer, url: string;
    async function start(draftFile?: string) {
        const homeService = new StudioHomeService("2.0.0", new InMemoryRecentProjectsRepository());
        server = new StudioServer({
            host: "127.0.0.1", port: 0, pokieVersion: "2.0.0", studioRoot: root, homeService,
            blueprintService: new StudioBlueprintService("2.0.0", root, homeService),
            ...(draftFile === undefined ? {} : {blueprintDraftStore: new FileStudioBlueprintDraftStore(draftFile)}),
            jobService: new StudioJobService(new FileStudioJobRepository(path.join(root, "jobs"))),
            projectRegistrationService: new StudioProjectRegistrationService(new InMemoryStudioProjectRegistry()),
        });
        const address = await server.start();
        url = `http://${address.host}:${address.port}/api/home/blueprints/draft`;
    }
    async function post(value: unknown, headers: Record<string, string> = {}) {
        const response = await fetch(url, {method: "POST", headers: {"Content-Type": "application/json", ...headers}, body: JSON.stringify(value)});
        return {status: response.status, body: await response.json()};
    }
    beforeEach(async () => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), "design-recovery-"));
        file = path.join(root, "producer", "config", "pokie", "studio-design-draft-v1.json");
        store = new FileStudioBlueprintDraftStore(file);
        await start(file);
    });
    afterEach(async () => {
        await server.stop();
        fs.rmSync(root, {recursive: true, force: true});
        jest.restoreAllMocks();
    });

    it("retains the edited document through config-only handoff and a fresh server; explicit clear survives another restart", async () => {
        expect(await (await fetch(url)).json()).toEqual({version: null});
        expect(fs.existsSync(file)).toBe(false); // Initial inspection must not create/replace a draft.
        const saved = await post({version: null, draft});
        expect(saved.status).toBe(200);
        expect(saved.body).toEqual({version: expect.any(String), draft});
        const consumer = path.join(root, "consumer", "config");
        fs.cpSync(path.join(root, "producer", "config"), consumer, {recursive: true});
        await server.stop();
        await start(path.join(consumer, "pokie", path.basename(file)));
        expect(await (await fetch(url)).json()).toEqual(saved.body);
        const cleared = await post({version: saved.body.version});
        expect(cleared.status).toBe(200);
        expect(cleared.body).toEqual({version: expect.any(String)});
        expect(new FileStudioBlueprintDraftStore(path.join(consumer, "pokie", path.basename(file))).read()).toEqual(cleared.body);
        expect(store.read()).toEqual(saved.body); // The copied profile and producer are independent.
    });

    it("uses platform application data through the default production server composition", async () => {
        const appData = path.join(root, "default-profile", "config", "pokie");
        jest.spyOn(PokiePathResolver.prototype, "resolveAppDataDirectory").mockReturnValue(appData);
        await server.stop();
        await start();
        const saved = await post({version: null, draft});
        expect(saved.status).toBe(200);
        expect(new FileStudioBlueprintDraftStore(path.join(appData, "studio-design-draft-v1.json")).read()).toEqual(saved.body);
        await server.stop();
        await start();
        expect(await (await fetch(url)).json()).toEqual(saved.body);
    });

    it.each(malformed)("rejects $diagnostic at shared validator, store and HTTP, then reuses the same store", async ({value, diagnostic}) => {
        expect(() => validateStudioBlueprintDraftSnapshot(value)).toThrow(diagnostic);
        expect(() => store.replace(value as unknown as StudioBlueprintDraftSnapshot)).toThrow(diagnostic);
        expect(await post(value)).toEqual({status: 400, body: {error: diagnostic}});
        expect(store.read()).toEqual({version: null});
        const saved = store.replace({version: null, draft})!;
        expect((await post(value)).status).toBe(400);
        expect(store.read()).toEqual(saved);
        const reused = store.replace({...saved, draft: {blueprint: {reels: 0}}})!;
        expect(store.replace({...reused, draft})!.draft).toEqual(draft);
    });

    it("rejects stale writes/clears without poisoning reuse, and requires the current token for explicit restore", async () => {
        const original = store.replace({version: null, draft})!;
        const edited = store.replace({...original, draft: {blueprint: {reels: 0}}})!;
        expect(await post({...original, draft})).toMatchObject({status: 409});
        expect(await post({version: original.version})).toMatchObject({status: 409});
        expect(store.read()).toEqual(edited);
        const restored = store.replace({...edited, draft})!;
        const next = store.replace(restored)!;
        expect(next.draft).toEqual(draft);
        const cleared = store.replace({version: next.version})!;
        expect(store.replace(original)).toBeUndefined();
        expect(store.replace({version: null, draft})).toBeUndefined();
        expect(new FileStudioBlueprintDraftStore(file).read()).toEqual(cleared);
        expect(store.replace({...cleared, draft})!.draft).toEqual(draft);
    });

    it("recovers invalid model edits without authorizing execution, and does not trust coordinated PAR metadata changes", async () => {
        const authored = {blueprint: {...draft.blueprint, reels: 0}, importedFromParSheetPath: path.join(root, "not-imported.xlsx"), conversionEvidence: {losslessEligible: true, importedBlueprintHash: "forged"}};
        const saved = await post({version: null, draft: authored});
        expect(saved.status).toBe(200);
        expect(store.read().draft).toEqual(authored);
        const validationUrl = url.replace(/draft$/, "validate");
        const validate = async (blueprint: unknown) => {
            const response = await fetch(validationUrl, {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({blueprint})});
            return response.json();
        };
        expect(await validate(authored.blueprint)).toMatchObject({status: "invalid"});
        expect(await validate(draft.blueprint)).toMatchObject({status: "ok"});
        const forged = await fetch(url.replace(/draft$/, "save-managed"), {
            method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({blueprint: draft.blueprint, sourceWorkbookPath: authored.importedFromParSheetPath, conversionEvidence: authored.conversionEvidence}),
        });
        expect(await forged.json()).toMatchObject({status: "error", error: expect.stringContaining("PAR import preparation is unavailable")});
        expect(store.read()).toEqual(saved.body);
    });

    it("preserves optional presence and rejects untrusted cross-origin mutation", async () => {
        const saved = await post({version: null, draft: {...draft, importedFromParSheetPath: "", conversionEvidence: null}});
        expect(saved.body.draft).toEqual({...draft, importedFromParSheetPath: "", conversionEvidence: null});
        expect((await post({version: saved.body.version}, {Origin: "https://untrusted.example"})).status).toBe(403);
        expect(store.read()).toEqual(saved.body);
    });

    it("reports corrupt envelope diagnostics without overwriting bytes, then reads a repaired snapshot", async () => {
        fs.mkdirSync(path.dirname(file), {recursive: true});
        const corrupt = JSON.stringify({version: null, draft: {blueprint: []}});
        fs.writeFileSync(file, corrupt);
        const response = await fetch(url);
        expect(response.status).toBe(500);
        expect(await response.json()).toMatchObject({error: expect.stringContaining("draft.blueprint")});
        expect(fs.readFileSync(file, "utf8")).toBe(corrupt);
        fs.writeFileSync(file, JSON.stringify({version: null, draft}));
        expect(store.read().draft).toEqual(draft);
        expect((await post({version: null, draft})).status).toBe(200);
    });

    it("keeps the previous committed document on a write failure, removes temporary bytes and succeeds on repeated reuse", () => {
        const original = store.replace({version: null, draft})!;
        const rename = jest.spyOn(fs, "renameSync").mockImplementationOnce(() => {
            throw new Error("Disk unavailable");
        });
        expect(() => store.replace({version: original.version})).toThrow("Disk unavailable");
        expect(store.read()).toEqual(original);
        expect(fs.readdirSync(path.dirname(file))).toEqual([path.basename(file)]);
        rename.mockRestore();
        const next = store.replace(original)!;
        expect(store.replace(next)!.draft).toEqual(draft);
    });

    it("bounds the retained slot without replacing the previous document on an oversized edit", () => {
        const original = store.replace({version: null, draft})!;
        expect(() => store.replace({version: original.version, draft: {blueprint: {note: "x".repeat(1_048_576)}}})).toThrow("recovery size limit");
        expect(store.read()).toEqual(original);
        expect(fs.readdirSync(path.dirname(file))).toEqual([path.basename(file)]);
    });
});
