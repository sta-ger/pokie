import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {BlueprintBuildPanel} from "../../../../../../cli/studio-client/src/components/blueprintEditor/BlueprintBuildPanel";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

describe("BlueprintBuildPanel", () => {
    const blueprint = {manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"}};

    function previewOkBody(overrides: Record<string, unknown> = {}) {
        return {
            status: "ok",
            warnings: [],
            manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
            reels: 3,
            rows: 3,
            symbolsCount: 2,
            blueprintHash: "sha256:abc",
            expectedFiles: ["package.json"],
            projectRoot: "/games/sample-slot",
            destinationHasContent: true,
            createFiles: [],
            updateFiles: ["package.json"],
            deleteFiles: [],
            ...overrides,
        };
    }

    function buildOkBody(overrides: Record<string, unknown> = {}) {
        return {
            status: "ok",
            projectRoot: "/games/sample-slot",
            manifest: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
            warnings: [],
            createdFiles: ["package.json"],
            buildInfo: {
                schemaVersion: 1,
                generatedBy: "pokie build",
                pokieVersion: "1.0.0",
                generatedAt: "2026-01-01T00:00:00.000Z",
                blueprintHash: "sha256:abc",
                game: {id: "sample-slot", name: "Sample Slot", version: "0.1.0"},
            },
            unchanged: false,
            ...overrides,
        };
    }

    it("confirms before building into a destination a fresh Build Preview reported as already having content", async () => {
        const user = userEvent.setup();
        const buildCalls: unknown[] = [];
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/blueprints/build-preview": () => ({ok: true, status: 200, body: previewOkBody()}),
            "/api/home/blueprints/build": (call) => {
                buildCalls.push(JSON.parse(call.init?.body ?? "{}"));
                return {ok: true, status: 200, body: buildOkBody()};
            },
        });

        renderWithProviders(<BlueprintBuildPanel blueprint={blueprint} />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Build Preview"}));
        expect(await screen.findByText(/Destination: \/games\/sample-slot/)).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Build Package"}));

        expect(await screen.findByText('"/games/sample-slot" already has content. Building will create/update files there. Continue?')).toBeInTheDocument();
        expect(buildCalls).toEqual([]);

        await user.click(screen.getByRole("button", {name: "Confirm"}));

        await waitFor(() => {
            expect(buildCalls).toEqual([{blueprint, outDir: undefined, sourcePath: undefined}]);
        });
    });

    it("confirms before building into a known non-empty destination even when Build Preview was never run", async () => {
        const user = userEvent.setup();
        const buildCalls: unknown[] = [];
        const previewCalls: unknown[] = [];
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/blueprints/build-preview": (call) => {
                previewCalls.push(JSON.parse(call.init?.body ?? "{}"));
                return {ok: true, status: 200, body: previewOkBody()};
            },
            "/api/home/blueprints/build": (call) => {
                buildCalls.push(JSON.parse(call.init?.body ?? "{}"));
                return {ok: true, status: 200, body: buildOkBody()};
            },
        });

        renderWithProviders(<BlueprintBuildPanel blueprint={blueprint} />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Build Package"}));

        expect(await screen.findByText('"/games/sample-slot" already has content. Building will create/update files there. Continue?')).toBeInTheDocument();
        expect(buildCalls).toEqual([]);
        expect(previewCalls).toEqual([{blueprint, outDir: undefined, sourcePath: undefined}]);

        await user.click(screen.getByRole("button", {name: "Confirm"}));

        await waitFor(() => {
            expect(buildCalls).toEqual([{blueprint, outDir: undefined, sourcePath: undefined}]);
        });
    });

    it("builds directly, with no confirmation, when Build Preview was never run and the destination turns out empty", async () => {
        const user = userEvent.setup();
        const buildCalls: unknown[] = [];
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/blueprints/build-preview": () => ({
                ok: true,
                status: 200,
                body: previewOkBody({destinationHasContent: false, createFiles: ["package.json"], updateFiles: []}),
            }),
            "/api/home/blueprints/build": (call) => {
                buildCalls.push(JSON.parse(call.init?.body ?? "{}"));
                return {ok: true, status: 200, body: buildOkBody()};
            },
        });

        renderWithProviders(<BlueprintBuildPanel blueprint={blueprint} />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Build Package"}));

        await waitFor(() => {
            expect(buildCalls).toEqual([{blueprint, outDir: undefined, sourcePath: undefined}]);
        });
        expect(screen.queryByText(/already has content/)).not.toBeInTheDocument();
    });

    it("never trusts a stale preview after the outDir was edited -- it re-checks the new destination fresh instead", async () => {
        const user = userEvent.setup();
        const buildCalls: unknown[] = [];
        const previewCalls: unknown[] = [];
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/blueprints/build-preview": (call) => {
                const body = JSON.parse(call.init?.body ?? "{}") as {outDir?: string};
                previewCalls.push(body);
                // The default destination (first Build Preview click) has content; the edited-to
                // destination does not -- if the stale first preview were wrongly reused, this build would
                // still report the default destination has content.
                return {ok: true, status: 200, body: previewOkBody({projectRoot: body.outDir ?? "/games/sample-slot", destinationHasContent: body.outDir === undefined})};
            },
            "/api/home/blueprints/build": (call) => {
                buildCalls.push(JSON.parse(call.init?.body ?? "{}"));
                return {ok: true, status: 200, body: buildOkBody({projectRoot: "/games/other"})};
            },
        });

        renderWithProviders(<BlueprintBuildPanel blueprint={blueprint} />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Build Preview"}));
        await screen.findByText(/Destination: \/games\/sample-slot/);

        await user.type(screen.getByRole("textbox", {name: "Output directory (optional)"}), "/games/other");
        await user.click(screen.getByRole("button", {name: "Build Package"}));

        await waitFor(() => {
            expect(buildCalls).toEqual([{blueprint, outDir: "/games/other", sourcePath: undefined}]);
        });
        expect(screen.queryByText(/already has content/)).not.toBeInTheDocument();
        expect(previewCalls).toEqual([
            {blueprint, outDir: undefined, sourcePath: undefined},
            {blueprint, outDir: "/games/other", sourcePath: undefined},
        ]);
    });
});
