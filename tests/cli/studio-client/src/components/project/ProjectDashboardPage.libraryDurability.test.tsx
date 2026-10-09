/** @jest-environment-options {"customExportConditions": ["node", "node-addons"]} */
import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import {GamePackageGenerator, loadPokieGameRuntime, OutcomeLibraryBundleReader, type GameBlueprint} from "pokie";
import type {RuntimePackageResolving} from "../../../../../../cli/materialize/materializeRuntimePackage.js";
import {StudioHomeService} from "../../../../../../cli/studio/home/StudioHomeService.js";
import {StudioBlueprintService} from "../../../../../../cli/studio/blueprint/StudioBlueprintService.js";
import {StudioProjectRegistrationService} from "../../../../../../cli/studio/StudioProjectRegistrationService.js";
import {FileStudioJobRepository} from "../../../../../../cli/studio/jobs/FileStudioJobRepository.js";
import {StudioJobService} from "../../../../../../cli/studio/jobs/StudioJobService.js";
import {StudioServer} from "../../../../../../cli/studio/StudioServer.js";
import {act, screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

// Production HTTP, generation, destination planning and persistence with the
// candidate-generated Node game; no compiler/build subprocess or browser receipt.
describe("P9-07 library publication and refreshed generation", () => {
    let workspace: string;
    let blueprintPath: string;
    let server: StudioServer;
    let transport: FetchLike;
    let runtime: Awaited<ReturnType<typeof loadPokieGameRuntime>> | undefined;
    let starts: Array<{preflightToken: string}>;
    let preflights: string[];
    let holdStart: boolean;
    let holdPreflight: boolean;
    let releaseStart: (() => void) | undefined;
    let releasePreflight: (() => void) | undefined;

    async function request<T>(url: string, body?: unknown): Promise<T> {
        const response = await transport(url, body === undefined ? undefined : {
            method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify(body),
        });
        const result = await response.json();
        if (!response.ok) throw new Error(`${url}: HTTP ${response.status}: ${JSON.stringify(result)}`);
        return result as T;
    }

    const fetchImpl: FetchLike = async (url, init) => {
        if (url === "/api/project/outcome-libraries/generate/jobs" && init?.method === "POST") {
            starts.push(JSON.parse(init.body!) as {preflightToken: string});
            if (holdStart) await new Promise<void>((resolve) => {
                releaseStart = resolve;
            });
        }
        if (url === "/api/project/outcome-libraries/generate/estimate" && holdPreflight) {
            await new Promise<void>((resolve) => {
                releasePreflight = resolve;
            });
        }
        const response = await transport(url, init);
        const body = await response.json();
        if (url === "/api/project/outcome-libraries/generate/estimate" && body.status === "ok") preflights.push(body.preflightToken);
        return {...response, json: () => Promise.resolve(body)};
    };

    beforeEach(async () => {
        workspace = fs.mkdtempSync(path.join(os.tmpdir(), "p907-library-durability-"));
        blueprintPath = path.join(workspace, "blueprint.json");
        const model = JSON.parse(fs.readFileSync(path.join(__dirname, "../../../../fixtures/p907/model.blueprint.json"), "utf8")) as GameBlueprint;
        model.paytable = {A: {2: 2}, B: {2: 2}};
        fs.writeFileSync(blueprintPath, JSON.stringify(model));
        const runtimeRoot = path.join(workspace, "runtime");
        new GamePackageGenerator("1.3.0").generate(model, workspace, runtimeRoot);
        runtime = await loadPokieGameRuntime(runtimeRoot, (entry) => require(entry));
        const game = runtime.game;
        const loadGame = () => Promise.resolve(game);
        const resolveRuntimePackageRoot: RuntimePackageResolving = () => Promise.resolve({runtimePath: runtimeRoot, release: () => Promise.resolve()});
        const registration = new StudioProjectRegistrationService();
        const homeService = new StudioHomeService("1.3.0", undefined, loadGame, undefined, resolveRuntimePackageRoot,
            (source) => registration.describeLocation(source));
        server = new StudioServer({
            pokieVersion: "1.3.0", host: "127.0.0.1", port: 0, studioRoot: workspace, homeService, loadGame, resolveRuntimePackageRoot,
            blueprintService: new StudioBlueprintService("1.3.0", workspace, homeService),
            projectRegistrationService: registration,
            jobService: new StudioJobService(new FileStudioJobRepository(path.join(workspace, "jobs"))),
        });
        const address = await server.start();
        transport = (url, init) => new Promise((resolve, reject) => {
            const req = http.request(`http://${address.host}:${address.port}${url}`, {method: init?.method, headers: init?.headers}, (res) => {
                const chunks: Buffer[] = [];
                res.on("data", (chunk: Buffer) => chunks.push(chunk));
                res.on("end", () => resolve({ok: res.statusCode! >= 200 && res.statusCode! < 300, status: res.statusCode!,
                    json: () => Promise.resolve(JSON.parse(Buffer.concat(chunks).toString("utf8")))}));
            });
            req.on("error", reject);
            req.end(init?.body);
        });
        starts = [];
        preflights = [];
        holdStart = false;
        holdPreflight = false;
        releaseStart = undefined;
        releasePreflight = undefined;
        await request("/api/home/projects/open", {projectRoot: blueprintPath});
        expect(await request("/api/project/context")).toMatchObject({type: "blueprint", capabilities: expect.arrayContaining(["blueprint.build"])});
    });

    afterEach(async () => {
        releaseStart?.();
        releasePreflight?.();
        await server?.stop();
        await runtime?.release();
        fs.rmSync(workspace, {recursive: true, force: true});
    });

    it("shows pending acceptance, refreshes publication authority before repeat generation, and opens the retained exact library", async () => {
        const user = userEvent.setup();
        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await user.click(await screen.findByRole("button", {name: "Build/Export"}));
        const generate = await screen.findByRole("button", {name: "Generate exact outcome library (base)"});
        await waitFor(() => expect(generate).toBeEnabled());
        holdStart = true;
        await user.click(generate);
        expect(await screen.findByText("Submitting Outcome Library generation…")).toBeInTheDocument();
        expect(generate).toBeDisabled();
        await user.click(generate);
        expect(starts).toHaveLength(1);
        holdPreflight = true;
        await act(() => releaseStart!());
        expect(await screen.findByText(/Generated 4 outcomes.*RTP 100.00%/)).toBeInTheDocument();
        await waitFor(() => expect(releasePreflight).toBeDefined());
        expect(generate).toBeDisabled();
        expect(screen.getByRole("button", {name: "Inspect library"})).toBeEnabled();
        const bundleDir = path.join(workspace, "outcomelibrary");
        const published = await new OutcomeLibraryBundleReader().readLibrary(bundleDir, "base");
        expect(published.outcomes.reduce((sum, outcome) => sum + outcome.weight, 0)).toBe(4);
        holdStart = false;
        holdPreflight = false;
        await act(() => releasePreflight!());
        await waitFor(() => expect(generate).toBeEnabled());
        expect(preflights.at(-1)).not.toBe(starts[0].preflightToken);
        await user.click(generate);
        await screen.findByText(/Generated 4 outcomes.*RTP 100.00%/);
        await waitFor(() => expect(generate).toBeEnabled());
        expect(starts).toHaveLength(2);
        expect(starts[1].preflightToken).not.toBe(starts[0].preflightToken);
        expect((await new OutcomeLibraryBundleReader().readLibrary(bundleDir, "base")).outcomes).toEqual(published.outcomes);
        expect(screen.queryByText(/project could not be loaded for outcome-library generation/)).not.toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Inspect library"}));
        await waitFor(async () => expect(await request("/api/project/context")).toMatchObject({projectRoot: bundleDir, project: {type: "outcomeLibrary"}}));
        expect(await screen.findByRole("heading", {name: "Outcome Source"})).toBeInTheDocument();
    });

    it("keeps the published result inspectable after remount even if a new generation destination conflicts", async () => {
        const user = userEvent.setup();
        const first = renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await user.click(await screen.findByRole("button", {name: "Build/Export"}));
        await waitFor(() => expect(screen.getByRole("button", {name: "Generate exact outcome library (base)"})).toBeEnabled());
        await user.click(screen.getByRole("button", {name: "Generate exact outcome library (base)"}));
        await screen.findByRole("button", {name: "Inspect library"});
        first.unmount();
        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await user.click(await screen.findByRole("button", {name: "Build/Export"}));
        expect(await screen.findByText(/Generated 4 outcomes.*RTP 100.00%/)).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Show Advanced generation controls"}));
        const conflictDir = path.join(workspace, "occupied");
        fs.mkdirSync(conflictDir);
        fs.writeFileSync(path.join(conflictDir, "user.txt"), "keep me");
        await user.clear(screen.getByLabelText("Output destination"));
        await user.type(screen.getByLabelText("Output destination"), "occupied");
        await waitFor(() => expect(document.querySelector('[data-pokie-lifecycle-preflight-status="error"]')).not.toBeNull());
        expect(screen.getByRole("button", {name: "Generate exact outcome library (base)"})).toBeDisabled();
        expect(screen.getByRole("button", {name: "Inspect library"})).toBeEnabled();
        expect(fs.readFileSync(path.join(conflictDir, "user.txt"), "utf8")).toBe("keep me");
        expect(starts).toHaveLength(1);
        await user.click(screen.getByRole("button", {name: "Inspect library"}));
        await waitFor(async () => expect(await request("/api/project/context")).toMatchObject({project: {type: "outcomeLibrary"}}));
    });
});
