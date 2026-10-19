import {MantineProvider} from "@mantine/core";
import {act, fireEvent, render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import type {GameModelProjection} from "../../../../../../cli/studio-client/src/api/types";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";
import {StudioBlueprintService} from "../../../../../../cli/studio/blueprint/StudioBlueprintService";
import {StudioHomeService} from "../../../../../../cli/studio/home/StudioHomeService";
import {InMemoryRecentProjectsRepository} from "../../../../../../cli/studio/InMemoryRecentProjectsRepository";
import boundedExample from "../../../../../../examples/blueprints/bounded-cascade-respins-collection.blueprint.json";
import {GameModelPreviewPanel} from "../../../../../../cli/studio-client/src/components/blueprintEditor/GameModelPreviewPanel";
import {StudioApiProvider} from "../../../../../../cli/studio-client/src/context/StudioApiProvider";

// Design Game's own live "Preview Game Model" action (GameModelPreviewPanel.tsx) -- an on-demand POST
// against the editor's current in-memory draft, rendered through the exact same GameModelSections
// component the Project Workspace's Game Model tab uses (see that panel's own doc comment for why this
// is the third of the three surfaces acceptance criterion 3 asks to share one projection).

async function deliver(action: () => void): Promise<void> {
    await act(async () => {
        action();
        await Promise.resolve();
    });
}

function respond(body: unknown) {
    return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(body)});
}

function unavailableProjection(): GameModelProjection {
    const reason = "no tracked source recorded";
    return {
        basics: {status: "available", data: {id: "starter", name: "Starter", version: "0.1.0"}},
        layout: {status: "unavailable", reason},
        symbols: {status: "unavailable", reason},
        reels: {status: "unavailable", reason},
        paytable: {status: "unavailable", reason},
        betsAndModes: {status: "unavailable", reason},
        mechanics: {status: "unavailable", reason},
        limits: {status: "unavailable", reason},
    };
}

// Delay only delivery, not projection semantics. These responses come from the real
// service and deliberately ignore abort, as a completed server request can do.
function deferredPreviews() {
    const service = new StudioBlueprintService("2.0.0", process.cwd(), new StudioHomeService("2.0.0", new InMemoryRecentProjectsRepository()));
    const requests: {blueprint: unknown; seed?: number; signal?: AbortSignal; complete: () => void; fail: () => void}[] = [];
    const writes: string[] = [];
    const fetchImpl: FetchLike = (url, init) => {
        if (url === "/api/project/symbol-artwork") return respond({artwork: {}});
        if (init?.method !== "POST") return respond([]);
        writes.push(url);
        const {blueprint, sharedWeightsSampleSeed: seed} = JSON.parse(init.body!);
        if (url === "/api/home/blueprints/validate") return respond(service.validate(blueprint));
        if (url === "/api/home/blueprints/game-model-preview") {
            const projection = JSON.parse(JSON.stringify(service.previewGameModel(blueprint, seed)));
            return new Promise((resolve, reject) => {
                requests.push({
                    blueprint, seed, signal: init.signal,
                    complete: () => resolve({ok: true, status: 200, json: () => Promise.resolve(projection)}),
                    fail: () => reject(new Error("preview delivery failed")),
                });
            });
        }
        throw new Error(`Unexpected write: ${url}`);
    };
    return {fetchImpl, requests, writes};
}

describe("Guided Design Game: Game Model preview", () => {
    it("retires a completed preview after the reported Description edit and previews the current validated draft only on request", async () => {
        const {fetchImpl, requests, writes} = deferredPreviews();
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"], strictMode: true});
        const description = screen.getByLabelText("Description (optional)");
        fireEvent.change(description, {target: {value: "stale preview baseline"}});
        fireEvent.blur(description);
        await waitFor(() => expect(screen.getByRole("button", {name: "Create game"})).toBeEnabled());
        fireEvent.click(screen.getByRole("button", {name: "Preview Game Model"}));
        await deliver(() => requests[0].complete());
        expect(screen.getByText("Description: stale preview baseline")).toBeVisible();

        fireEvent.change(description, {target: {value: "stale preview replacement"}});
        fireEvent.blur(description);
        expect(screen.queryByText("Description: stale preview baseline")).toBeNull();
        await waitFor(() => expect(screen.getByRole("button", {name: "Create game"})).toBeEnabled());
        expect(requests).toHaveLength(1);
        expect(screen.queryByText("Description: stale preview baseline")).toBeNull();
        fireEvent.click(screen.getByRole("button", {name: "Preview Game Model"}));
        await deliver(() => requests[1].complete());
        expect(screen.getByText("Description: stale preview replacement")).toBeVisible();
        expect(requests[1].blueprint).toMatchObject({manifest: {description: "stale preview replacement"}});
        expect(writes.every(url => ["/api/home/blueprints/validate", "/api/home/blueprints/game-model-preview"].includes(url))).toBe(true);
    });

    it.each([
        {change: "blueprint", outcome: "success"},
        {change: "blueprint", outcome: "failure"},
        {change: "revision", outcome: "success"},
        {change: "revision", outcome: "failure"},
        {change: "source", outcome: "success"},
        {change: "source", outcome: "failure"},
        {change: "all inputs", outcome: "success"},
        {change: "all inputs", outcome: "failure"},
    ])("retires loaded and pending state on $change change and ignores obsolete $outcome delivery", async ({change, outcome}) => {
        const {fetchImpl, requests} = deferredPreviews();
        const original = {...boundedExample, manifest: {...boundedExample.manifest, description: "original preview"}};
        const replacement = {...original, manifest: {...original.manifest, description: "replacement preview"}};
        const first = {blueprint: original, revision: 1, sourcePath: "/first.json"};
        const second = {
            blueprint: change === "blueprint" || change === "all inputs" ? replacement : original,
            revision: change === "revision" || change === "all inputs" ? 2 : 1,
            sourcePath: change === "source" || change === "all inputs" ? "/second.json" : "/first.json",
        };
        const view = render(<GameModelPreviewPanel {...first} />, {wrapper: ({children}) => (
            <MantineProvider><StudioApiProvider fetchImpl={fetchImpl}>{children}</StudioApiProvider></MantineProvider>
        )});
        const preview = screen.getByRole("button", {name: "Preview Game Model"});
        fireEvent.click(preview);
        await deliver(() => requests[0].complete());
        expect(screen.getByText("Description: original preview")).toBeVisible();
        view.rerender(<GameModelPreviewPanel {...first} />);
        expect(screen.getByText("Description: original preview")).toBeVisible();
        expect(requests).toHaveLength(1);
        view.rerender(<GameModelPreviewPanel {...second} />);
        expect(screen.queryByText("Description: original preview")).toBeNull();

        fireEvent.click(preview);
        expect(preview).toBeDisabled();
        view.rerender(<GameModelPreviewPanel {...first} />);
        expect(requests[1].signal?.aborted).toBe(true);
        expect(preview).toBeEnabled();
        expect(screen.queryByText("Building preview…")).toBeNull();
        // Returning to identical earlier input must not revive its previous generation.
        fireEvent.click(preview);
        await deliver(() => requests[2].complete());
        expect(screen.getByText("Description: original preview")).toBeVisible();
        await deliver(() => outcome === "success" ? requests[1].complete() : requests[1].fail());
        expect(screen.getByText("Description: original preview")).toBeVisible();
        expect(screen.queryByText("Description: replacement preview")).toBeNull();
        expect(screen.queryByRole("alert")).toBeNull();
        expect(preview).toBeEnabled();
        fireEvent.click(preview);
        view.unmount();
        expect(requests[3].signal?.aborted).toBe(true);
        await deliver(() => requests[3].complete());
    });

    it("recovers from a current failure and retires its error on edit before repeated successful previews", async () => {
        const {fetchImpl, requests} = deferredPreviews();
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        const preview = screen.getByRole("button", {name: "Preview Game Model"});
        fireEvent.click(preview);
        await deliver(() => requests[0].complete());
        expect(screen.getByText("Id: starter-slot")).toBeVisible();
        fireEvent.click(preview);
        await deliver(() => requests[1].fail());
        expect(screen.getByRole("alert")).toHaveTextContent("We couldn't build this game model preview.");
        const description = screen.getByLabelText("Description (optional)");
        fireEvent.change(description, {target: {value: "repaired current draft"}});
        fireEvent.blur(description);
        expect(screen.queryByRole("alert")).toBeNull();
        for (const index of [2, 3]) {
            fireEvent.click(preview);
            await deliver(() => requests[index].complete());
            expect(screen.getByText("Description: repaired current draft")).toBeVisible();
        }
        await waitFor(() => expect(screen.getByRole("button", {name: "Create game"})).toBeEnabled());
    });

    it("uses the same guarded lifecycle for New sample and preserves its seed across ordinary draft edits", async () => {
        const {fetchImpl, requests} = deferredPreviews();
        const blueprint = {
            manifest: {id: "sample", name: "Sample", version: "1.0.0"},
            reels: 2, rows: 1, symbols: ["A", "B"], paytable: {}, availableBets: [1],
            symbolWeights: {A: 2, B: 1},
        };
        const view = render(<GameModelPreviewPanel blueprint={blueprint} revision={1} />, {wrapper: ({children}) => (
            <MantineProvider><StudioApiProvider fetchImpl={fetchImpl}>{children}</StudioApiProvider></MantineProvider>
        )});
        const preview = screen.getByRole("button", {name: "Preview Game Model"});
        fireEvent.click(preview);
        await deliver(() => requests[0].complete());
        expect(requests[0].seed).toBeUndefined();
        fireEvent.click(screen.getByRole("button", {name: "New sample"}));
        expect(requests[1].seed).toEqual(expect.any(Number));
        view.rerender(<GameModelPreviewPanel blueprint={{...blueprint, manifest: {...blueprint.manifest, description: "edited sample"}}} revision={2} />);
        expect(requests[1].signal?.aborted).toBe(true);
        fireEvent.click(preview);
        expect(requests[2].seed).toBe(requests[1].seed);
        await deliver(() => requests[2].complete());
        expect(screen.getByText("Description: edited sample")).toBeVisible();
        const sampleText = screen.getByText(/This mode has no single fixed strip/).textContent;
        expect(sampleText).toContain(`seed ${requests[2].seed}`);
        await deliver(() => requests[1].complete());
        expect(screen.getByText("Description: edited sample")).toBeVisible();
        expect(screen.getByText(/This mode has no single fixed strip/)).toHaveTextContent(sampleText!);
    });

    it.each([
        {mechanics: {respins: {grant: 2}}, path: "mechanics.respins.trigger"},
        {mechanics: {cascade: {maxCascades: {invalid: true}}}, path: "mechanics.cascade.maxCascades"},
        {mechanics: {collection: {...boundedExample.mechanics.collection, reset: {invalid: true}}}, path: "mechanics.collection.reset"},
        {mechanics: {respins: {...boundedExample.mechanics.respins, maxRespins: {toString: null, valueOf: null}}}, path: "mechanics.respins.maxRespins"},
        {mechanics: {collection: {...boundedExample.mechanics.collection, threshold: {toString: null, valueOf: null}}}, path: "mechanics.collection.threshold"},
    ])("keeps $path recoverable through the real preview service without saving or building", async ({mechanics, path}) => {
        const service = new StudioBlueprintService("1.3.0", process.cwd(), new StudioHomeService("1.3.0", new InMemoryRecentProjectsRepository()));
        const previews: unknown[] = [];
        const writes: string[] = [];
        const valid = {...boundedExample, mechanics: {...boundedExample.mechanics, collection: {...boundedExample.mechanics.collection, contribution: 0, payout: 0}}};
        const malformed = {...valid, mechanics};
        const fetchImpl: FetchLike = (url, init) => {
            if (url === "/api/project/symbol-artwork") return respond({artwork: {}});
            if (init?.method === "POST") {
                writes.push(url);
                const request = JSON.parse(init.body!);
                if (url === "/api/home/blueprints/validate") return respond(service.validate(request.blueprint));
                if (url === "/api/home/blueprints/game-model-preview") {
                    previews.push(request.blueprint);
                    return respond(JSON.parse(JSON.stringify(service.previewGameModel(request.blueprint))));
                }
                throw new Error(`Unexpected write: ${url}`);
            }
            return respond([]);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        fireEvent.click(screen.getByRole("button", {name: /Show advanced options/}));
        fireEvent.click(screen.getByLabelText("JSON"));
        for (const [index, draft] of [valid, malformed, valid, valid].entries()) {
            const authored = JSON.stringify(draft, null, 2);
            // Apply JSON intentionally remounts the JSON and preview panels. Re-query public
            // controls after each apply; the final preview reuses the repaired panel directly.
            if (index < 3) {
                fireEvent.change(screen.getByLabelText("Blueprint JSON"), {target: {value: authored}});
                fireEvent.click(screen.getByRole("button", {name: "Apply JSON"}));
            }
            fireEvent.click(screen.getByLabelText("Form"));
            fireEvent.click(screen.getByRole("tab", {name: /^Bets/}));
            if (draft === malformed) {
                await waitFor(() => expect(screen.getByRole("button", {name: "Create game"})).toBeDisabled());
                expect(screen.getByText(new RegExp(`Correct mechanics.${Object.keys(mechanics)[0]} in JSON`))).toBeVisible();
            } else {
                await waitFor(() => expect(screen.getByRole("button", {name: "Create game"})).toBeEnabled());
                expect(screen.getByLabelText("Maximum executed respins")).toBeVisible();
                expect(screen.getByLabelText("Collection contribution")).toHaveValue("0");
            }
            fireEvent.click(screen.getByLabelText("JSON"));
            const preview = screen.getByRole("button", {name: "Preview Game Model"});
            fireEvent.click(preview);
            const panel = screen.getByText("Game Model preview").closest("fieldset")!;
            await waitFor(() => expect(preview).toBeEnabled());
            expect(await within(panel).findByText(`Id: ${valid.manifest.id}`)).toBeVisible();
            expect(within(panel).getByText("Paytable")).toBeVisible();
            if (draft === malformed) {
                const alert = within(panel).getByRole("alert");
                expect(alert).toHaveTextContent("These mechanics can't be previewed yet. Correct the rule fields, then preview again. The authored draft is unchanged.");
                fireEvent.click(within(alert).getByText("Technical details"));
                expect(alert).toHaveTextContent(path);
                expect(within(panel).queryByText(/^Respins:/)).toBeNull();
                expect(within(panel).queryByText(/^Cascade:/)).toBeNull();
                expect(within(panel).queryByText(/^Collection:/)).toBeNull();
                expect(within(panel).queryByText("No mechanics/features configured.")).toBeNull();
            } else {
                expect(within(panel).queryByRole("alert")).toBeNull();
                expect(within(panel).getByText(/^Cascade: maximum/)).toBeVisible();
                expect(within(panel).getByText(/^Respins: trigger symbol/)).toBeVisible();
                expect(within(panel).getByText(/^Collection: symbol/)).toHaveTextContent(/contribution 0 per symbol;.*payout 0/);
            }
            expect(screen.getByLabelText("Blueprint JSON")).toHaveValue(authored);
        }
        expect(previews).toEqual([valid, malformed, valid, valid]);
        expect(writes.every(url => ["/api/home/blueprints/validate", "/api/home/blueprints/game-model-preview"].includes(url))).toBe(true);
    });

    it("shows the projection returned by POST /api/home/blueprints/game-model-preview after clicking Preview Game Model", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/home/blueprints/game-model-preview" && init?.method === "POST") {
                return respond(unavailableProjection());
            }
            if (path === "/api/home/blueprints/validate" && init?.method === "POST") {
                return respond({status: "ok", warnings: []});
            }
            return respond([]);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await user.click(screen.getByRole("button", {name: "Preview Game Model"}));

        expect(await screen.findByText("Id: starter")).toBeInTheDocument();
        expect(screen.getAllByText("This part of the Game Model isn't available yet. Check the game design, then try viewing the Game Model again.").length).toBeGreaterThan(0);
        const details = screen.getAllByText("no tracked source recorded").map((reason) => reason.closest("details"));
        expect(details).not.toHaveLength(0);
        expect(details.every((detail) => detail !== null && !detail.hasAttribute("open"))).toBe(true);
    });

    it("shows a recovery message, never a raw stack trace, when the preview request fails", async () => {
        const user = userEvent.setup();
        const fetchImpl: FetchLike = (url, init) => {
            const [path] = url.split("?");
            if (path === "/api/home/blueprints/game-model-preview" && init?.method === "POST") {
                return Promise.resolve({ok: false, status: 500, json: () => Promise.resolve({error: "boom"})});
            }
            if (path === "/api/home/blueprints/validate" && init?.method === "POST") {
                return respond({status: "ok", warnings: []});
            }
            return respond([]);
        };
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});

        await user.click(screen.getByRole("button", {name: "Preview Game Model"}));

        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent("We couldn't build this game model preview. Check the game design, then try previewing it again.");
        const details = screen.getByText("Technical details").closest("details");
        expect(details).not.toHaveAttribute("open");
        expect(details).toHaveTextContent("boom");
    });
});
