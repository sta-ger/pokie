import {screen, waitFor} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {BuildFromBlueprintPanel} from "../../../../../../cli/studio-client/src/components/home/BuildFromBlueprintPanel";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

describe("BuildFromBlueprintPanel", () => {
    it("Browse for the blueprint path lists files and selects one by clicking it", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    resolvedPath: "/games",
                    displayPath: "./games",
                    entries: [
                        {name: "sample-slot", isDirectory: true},
                        {name: "blueprint.json", isDirectory: false},
                    ],
                },
            }),
        });

        renderWithProviders(<BuildFromBlueprintPanel />, {fetchImpl});

        const [blueprintBrowse] = screen.getAllByRole("button", {name: "Browse…"});
        await user.click(blueprintBrowse);

        expect(await screen.findByText("blueprint.json")).toBeInTheDocument();
        expect(screen.getByText("sample-slot")).toBeInTheDocument();
        // A directory picker's own "Select this folder" is unavailable here -- kind="file" never shows it.
        expect(screen.queryByRole("button", {name: "Select this folder"})).not.toBeInTheDocument();

        await user.click(screen.getByText("blueprint.json"));

        expect(screen.getByRole("textbox", {name: "Blueprint JSON path"})).toHaveValue("./games/blueprint.json");
    });

    it("Browse for the output directory offers 'Select this folder' and updates the outDir field", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "ok", resolvedPath: "/out", displayPath: "./out", entries: []}}),
        });

        renderWithProviders(<BuildFromBlueprintPanel />, {fetchImpl});

        const [, outDirBrowse] = screen.getAllByRole("button", {name: "Browse…"});
        await user.click(outDirBrowse);

        await user.click(await screen.findByRole("button", {name: "Select this folder"}));

        expect(screen.getByRole("textbox", {name: "Output directory (optional)"})).toHaveValue("./out");
    });

    it("Browse cancellation never changes either path field", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/fs/browse": () => ({ok: true, status: 200, body: {status: "ok", resolvedPath: "/games", displayPath: "./games", entries: [{name: "blueprint.json", isDirectory: false}]}}),
        });

        renderWithProviders(<BuildFromBlueprintPanel />, {fetchImpl});

        const [blueprintBrowse] = screen.getAllByRole("button", {name: "Browse…"});
        await user.click(blueprintBrowse);
        expect(await screen.findByText("blueprint.json")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Cancel"}));

        expect(screen.getByRole("textbox", {name: "Blueprint JSON path"})).toHaveValue("");
        expect(screen.getByRole("textbox", {name: "Output directory (optional)"})).toHaveValue("");
    });

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

    it("confirms before building into a destination a fresh Preview reported as already having content", async () => {
        const user = userEvent.setup();
        const buildCalls: unknown[] = [];
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/projects/build/preview": () => ({ok: true, status: 200, body: previewOkBody()}),
            "/api/home/projects/build": (call) => {
                buildCalls.push(JSON.parse(call.init?.body ?? "{}"));
                return {
                    ok: true,
                    status: 200,
                    body: {
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
                    },
                };
            },
        });

        renderWithProviders(<BuildFromBlueprintPanel />, {fetchImpl});

        await user.type(screen.getByRole("textbox", {name: "Blueprint JSON path"}), "/games/blueprint.json");
        await user.click(screen.getByRole("button", {name: "Preview"}));
        expect(await screen.findByText(/Destination: \/games\/sample-slot/)).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Build"}));

        expect(await screen.findByText('"/games/sample-slot" already has content. Building will create/update files there. Continue?')).toBeInTheDocument();
        expect(buildCalls).toEqual([]);

        await user.click(screen.getByRole("button", {name: "Confirm"}));

        expect(await screen.findByText(/"\/games\/sample-slot"\.$/)).toBeInTheDocument();
        expect(buildCalls).toEqual([{blueprintPath: "/games/blueprint.json", outDir: undefined}]);
    });

    it("confirms before building into the default destination when the output field is left whitespace-only", async () => {
        const user = userEvent.setup();
        const buildCalls: unknown[] = [];
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/projects/build/preview": () => ({ok: true, status: 200, body: previewOkBody()}),
            "/api/home/projects/build": (call) => {
                buildCalls.push(JSON.parse(call.init?.body ?? "{}"));
                return {
                    ok: true,
                    status: 200,
                    body: {
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
                    },
                };
            },
        });

        renderWithProviders(<BuildFromBlueprintPanel />, {fetchImpl});

        await user.type(screen.getByRole("textbox", {name: "Blueprint JSON path"}), "/games/blueprint.json");
        await user.type(screen.getByRole("textbox", {name: "Output directory (optional)"}), "   ");
        await user.click(screen.getByRole("button", {name: "Preview"}));
        expect(await screen.findByText(/Destination: \/games\/sample-slot/)).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Build"}));

        expect(await screen.findByText('"/games/sample-slot" already has content. Building will create/update files there. Continue?')).toBeInTheDocument();
        expect(buildCalls).toEqual([]);

        await user.click(screen.getByRole("button", {name: "Confirm"}));

        expect(await screen.findByText(/"\/games\/sample-slot"\.$/)).toBeInTheDocument();
        expect(buildCalls).toEqual([{blueprintPath: "/games/blueprint.json", outDir: undefined}]);
    });

    it("never trusts a stale preview after the outDir was edited -- it re-checks the new destination fresh instead", async () => {
        const user = userEvent.setup();
        const buildCalls: unknown[] = [];
        const previewCalls: unknown[] = [];
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/projects/build/preview": (call) => {
                const body = JSON.parse(call.init?.body ?? "{}") as {outDir?: string};
                previewCalls.push(body);
                // The default destination ("/games/sample-slot", first Preview click) has content; the
                // edited-to destination ("/games/other") does not -- if the stale first preview were
                // wrongly reused, this second build would report "/games/sample-slot" has content instead.
                return {ok: true, status: 200, body: previewOkBody({projectRoot: body.outDir ?? "/games/sample-slot", destinationHasContent: body.outDir === undefined})};
            },
            "/api/home/projects/build": (call) => {
                buildCalls.push(JSON.parse(call.init?.body ?? "{}"));
                return {
                    ok: true,
                    status: 200,
                    body: {
                        status: "ok",
                        projectRoot: "/games/other",
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
                    },
                };
            },
        });

        renderWithProviders(<BuildFromBlueprintPanel />, {fetchImpl});

        await user.type(screen.getByRole("textbox", {name: "Blueprint JSON path"}), "/games/blueprint.json");
        await user.click(screen.getByRole("button", {name: "Preview"}));
        await screen.findByText(/Destination: \/games\/sample-slot/);

        await user.type(screen.getByRole("textbox", {name: "Output directory (optional)"}), "/games/other");
        await user.click(screen.getByRole("button", {name: "Build"}));

        await waitFor(() => {
            expect(buildCalls).toEqual([{blueprintPath: "/games/blueprint.json", outDir: "/games/other"}]);
        });
        expect(screen.queryByText(/already has content/)).not.toBeInTheDocument();
        expect(previewCalls).toEqual([
            {blueprintPath: "/games/blueprint.json", outDir: undefined},
            {blueprintPath: "/games/blueprint.json", outDir: "/games/other"},
        ]);
    });

    it("confirms before building into a known non-empty destination even when Preview was never run", async () => {
        const user = userEvent.setup();
        const buildCalls: unknown[] = [];
        const previewCalls: unknown[] = [];
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/projects/build/preview": (call) => {
                previewCalls.push(JSON.parse(call.init?.body ?? "{}"));
                return {ok: true, status: 200, body: previewOkBody()};
            },
            "/api/home/projects/build": (call) => {
                buildCalls.push(JSON.parse(call.init?.body ?? "{}"));
                return {
                    ok: true,
                    status: 200,
                    body: {
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
                    },
                };
            },
        });

        renderWithProviders(<BuildFromBlueprintPanel />, {fetchImpl});

        await user.type(screen.getByRole("textbox", {name: "Blueprint JSON path"}), "/games/blueprint.json");
        await user.click(screen.getByRole("button", {name: "Build"}));

        expect(await screen.findByText('"/games/sample-slot" already has content. Building will create/update files there. Continue?')).toBeInTheDocument();
        expect(buildCalls).toEqual([]);
        expect(previewCalls).toEqual([{blueprintPath: "/games/blueprint.json", outDir: undefined}]);

        await user.click(screen.getByRole("button", {name: "Confirm"}));

        expect(await screen.findByText(/"\/games\/sample-slot"\.$/)).toBeInTheDocument();
        expect(buildCalls).toEqual([{blueprintPath: "/games/blueprint.json", outDir: undefined}]);
    });

    it("does not build, and shows an error instead, when the destination check fails and Preview was never run", async () => {
        const user = userEvent.setup();
        const buildCalls: unknown[] = [];
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/projects/build/preview": () => ({ok: false, status: 500, body: {error: "network down"}}),
            "/api/home/projects/build": (call) => {
                buildCalls.push(JSON.parse(call.init?.body ?? "{}"));
                return {ok: true, status: 200, body: {status: "ok"}};
            },
        });

        renderWithProviders(<BuildFromBlueprintPanel />, {fetchImpl});

        await user.type(screen.getByRole("textbox", {name: "Blueprint JSON path"}), "/games/blueprint.json");
        await user.click(screen.getByRole("button", {name: "Build"}));

        expect(await screen.findByText("The blueprint file could not be completed. Try again, and check the Studio server logs if the problem persists.")).toBeInTheDocument();
        expect(buildCalls).toEqual([]);
    });

    it("builds directly, with no confirmation, when Preview was never run and the destination turns out empty", async () => {
        const user = userEvent.setup();
        const buildCalls: unknown[] = [];
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/home/projects/build/preview": () => ({ok: true, status: 200, body: previewOkBody({destinationHasContent: false, createFiles: ["package.json"], updateFiles: []})}),
            "/api/home/projects/build": (call) => {
                buildCalls.push(JSON.parse(call.init?.body ?? "{}"));
                return {
                    ok: true,
                    status: 200,
                    body: {
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
                    },
                };
            },
        });

        renderWithProviders(<BuildFromBlueprintPanel />, {fetchImpl});

        await user.type(screen.getByRole("textbox", {name: "Blueprint JSON path"}), "/games/blueprint.json");
        await user.click(screen.getByRole("button", {name: "Build"}));

        await waitFor(() => {
            expect(buildCalls).toEqual([{blueprintPath: "/games/blueprint.json", outDir: undefined}]);
        });
        expect(screen.queryByText(/already has content/)).not.toBeInTheDocument();
    });
});
