import {screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const GAME = {id: "a", name: "A", version: "1.0.0"};
const PROJECT_ROOT = "/games/a";
const SOURCE_PATH = "/games/a-source/blueprint.json";

const PROJECT_ROUTES = {
    "/api/project/context": () => ({
        ok: true,
        status: 200,
        body: {status: "loaded", projectRoot: PROJECT_ROOT, game: GAME, type: "blueprint", capabilities: ["blueprint.build"]},
    }),
    "/api/project/inspect": () => ({
        ok: true,
        status: 200,
        body: {
            packageRoot: PROJECT_ROOT,
            valid: true,
            generated: true,
            buildInfo: {
                schemaVersion: 1,
                generatedBy: "pokie build",
                pokieVersion: "1.3.0",
                generatedAt: "2026-01-01T00:00:00.000Z",
                blueprintHash: "sha256:blueprint",
                source: SOURCE_PATH,
                game: GAME,
            },
        },
    }),
    "/api/project/reports": () => ({ok: true, status: 200, body: []}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
    "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
};

async function goToMechanicsEditorTab(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await screen.findByRole("heading", {name: "A"});
    await user.click(screen.getByRole("button", {name: "Game Model"}));
}

// P3-POLISH-16: Blueprint's own Game Model tab now goes through the same unified, read-only
// GameModelProjection view as an introspectable-but-not-editable package/WASM project -- see
// MechanicsEditorTab's own doc comment. The guided EditableMechanicsEditor is kept in that file,
// unreferenced, purely for the P3-POLISH-17 migration to build on; it is not reachable from here, and this
// suite intentionally no longer drives it through ProjectDashboardPage.
describe("ProjectDashboardPage - Mechanics Editor workflow (Blueprint projects)", () => {
    it("renders every viewer section straight off the server-owned projection, with no edit fields, Edit action, Save changes action, or Cancel action anywhere", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...PROJECT_ROUTES,
            "/api/project/gameModel": () => ({
                ok: true,
                status: 200,
                body: {
                    basics: {status: "available", data: GAME},
                    layout: {status: "available", data: {reels: 3, rows: 3, winModel: {type: "lines"}, paylineCount: 1}},
                    symbols: {status: "available", data: [{id: "A", isWild: false, isScatter: false}]},
                    reels: {status: "available", data: {generationMode: "default"}},
                    paytable: {status: "available", data: [{symbolId: "A", matchCount: 3, payout: 5}]},
                    betsAndModes: {status: "available", data: {availableBets: [1], betModes: []}},
                    mechanics: {status: "available", data: {}},
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToMechanicsEditorTab(user);

        // Every one of GameModelView's own sections is present.
        expect(await screen.findByText("Id: a")).toBeInTheDocument();
        for (const legend of ["Game basics", "Layout", "Symbols", "Reels", "Paytable", "Bets & Modes", "Mechanics"]) {
            expect(screen.getByText(legend)).toBeInTheDocument();
        }
        expect(screen.getByText("Reels: 3")).toBeInTheDocument();
        expect(screen.getByText("Generation mode: Default (uniform across symbols)")).toBeInTheDocument();
        expect(screen.getByText(/Read-only/)).toBeInTheDocument();

        // No editable form controls, and no Edit/Save changes/Cancel/Apply action anywhere -- Blueprint
        // editing is deferred to P3-POLISH-17 (see MechanicsEditorTab's own doc comment).
        expect(screen.queryByRole("button", {name: "Edit"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Save changes"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Cancel"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Apply"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Run validation"})).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Discard draft"})).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Reels")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Symbol 1 id")).not.toBeInTheDocument();
        expect(screen.queryByLabelText("New bet mode id")).not.toBeInTheDocument();
    });

    it("shows an explicit per-section \"Not available\" diagnostic for a Blueprint project whose game model is only partially introspectable", async () => {
        const user = userEvent.setup();
        const reason = "This project's build record has no tracked source blueprint path on record, so this section can't be shown here.";
        const {fetchImpl} = createRoutedFakeFetch({
            ...PROJECT_ROUTES,
            "/api/project/gameModel": () => ({
                ok: true,
                status: 200,
                body: {
                    basics: {status: "available", data: GAME},
                    layout: {status: "unavailable", reason},
                    symbols: {status: "unavailable", reason},
                    reels: {status: "unavailable", reason},
                    paytable: {status: "unavailable", reason},
                    betsAndModes: {status: "unavailable", reason},
                    mechanics: {status: "unavailable", reason},
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToMechanicsEditorTab(user);

        expect(await screen.findByText("Id: a")).toBeInTheDocument();
        expect(screen.getAllByText(/Not available — This project's build record has no tracked source/).length).toBe(6);
        expect(screen.queryByRole("button", {name: "Edit"})).not.toBeInTheDocument();
    });

    it("shows a subject-specific recovery message, never the raw backend text, when loading the project's game model fails", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...PROJECT_ROUTES,
            "/api/project/gameModel": () => ({ok: false, status: 500, body: {error: "Studio server crashed unexpectedly"}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToMechanicsEditorTab(user);

        expect(
            await screen.findByText("The project's game model could not be completed. Try again, and check the Studio server logs if the problem persists."),
        ).toBeInTheDocument();
        expect(screen.queryByText(/Studio server crashed unexpectedly/)).not.toBeInTheDocument();
    });
});

// P3-POLISH-16: Game Model is read-only, via GameModelView's own server/core-owned projection (GET
// /api/project/gameModel -- see buildGameModelProjection in "pokie" core / buildProjectGameModel.ts in
// cli/studio), for every project that can view it at all -- both a Blueprint project (BLUEPRINT_BUILD_
// CAPABILITY, see the describe block above) and an introspectable-but-not-editable package/WASM project
// below go through the exact same unified viewer. No Edit action exists anywhere in this read-only path.
describe("ProjectDashboardPage - Game Model (read-only, introspectable-but-not-editable projects)", () => {
    const READ_ONLY_GAME = {id: "b", name: "B", version: "1.0.0"};
    const READ_ONLY_ROUTES = {
        "/api/project/context": () => ({
            ok: true,
            status: 200,
            body: {status: "loaded", projectRoot: "/games/b", game: READ_ONLY_GAME, type: "tsPackage", capabilities: ["runtime.execute"]},
        }),
        "/api/project/reports": () => ({ok: true, status: 200, body: []}),
        "/api/project/replays": () => ({ok: true, status: 200, body: []}),
        "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
        "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
    };

    async function goToReadOnlyGameModelTab(user: ReturnType<typeof userEvent.setup>): Promise<void> {
        await screen.findByRole("heading", {name: "B"});
        await user.click(screen.getByRole("button", {name: "Game Model"}));
    }

    it("renders every section straight off the server-owned projection for a tracked-source tsPackage project, with no Edit control anywhere", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...READ_ONLY_ROUTES,
            "/api/project/inspect": () => ({
                ok: true,
                status: 200,
                body: {
                    packageRoot: "/games/b",
                    valid: true,
                    generated: true,
                    buildInfo: {
                        schemaVersion: 1,
                        generatedBy: "pokie build",
                        pokieVersion: "1.3.0",
                        generatedAt: "2026-01-01T00:00:00.000Z",
                        blueprintHash: "sha256:blueprint",
                        source: "/games/b-source/blueprint.json",
                        game: READ_ONLY_GAME,
                    },
                },
            }),
            "/api/project/gameModel": () => ({
                ok: true,
                status: 200,
                body: {
                    basics: {status: "available", data: READ_ONLY_GAME},
                    layout: {status: "available", data: {reels: 3, rows: 3, winModel: {type: "lines"}, paylineCount: 1}},
                    symbols: {status: "available", data: [{id: "A", isWild: false, isScatter: false}]},
                    reels: {status: "available", data: {generationMode: "default"}},
                    paytable: {status: "available", data: [{symbolId: "A", matchCount: 3, payout: 5}]},
                    betsAndModes: {status: "available", data: {availableBets: [1], betModes: []}},
                    mechanics: {status: "available", data: {}},
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReadOnlyGameModelTab(user);

        expect(await screen.findByText("Id: b")).toBeInTheDocument();
        expect(screen.getByText("Reels: 3")).toBeInTheDocument();
        expect(screen.getByText("Generation mode: Default (uniform across symbols)")).toBeInTheDocument();
        expect(screen.getByText(/Read-only/)).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Edit"})).not.toBeInTheDocument();
        expect(screen.queryByLabelText("Reels")).not.toBeInTheDocument();
    });

    it("shows an explicit per-section \"Not available\" diagnostic for a project whose game model is only partially introspectable (generated, but no tracked source recorded)", async () => {
        const user = userEvent.setup();
        const reason = "This project's build record has no tracked source blueprint path on record, so this section can't be shown here.";
        const {fetchImpl} = createRoutedFakeFetch({
            ...READ_ONLY_ROUTES,
            "/api/project/inspect": () => ({
                ok: true,
                status: 200,
                body: {
                    packageRoot: "/games/b",
                    valid: true,
                    generated: true,
                    buildInfo: {
                        schemaVersion: 1,
                        generatedBy: "pokie build",
                        pokieVersion: "1.3.0",
                        generatedAt: "2026-01-01T00:00:00.000Z",
                        blueprintHash: "sha256:blueprint",
                        game: READ_ONLY_GAME,
                    },
                },
            }),
            "/api/project/gameModel": () => ({
                ok: true,
                status: 200,
                body: {
                    basics: {status: "available", data: READ_ONLY_GAME},
                    layout: {status: "unavailable", reason},
                    symbols: {status: "unavailable", reason},
                    reels: {status: "unavailable", reason},
                    paytable: {status: "unavailable", reason},
                    betsAndModes: {status: "unavailable", reason},
                    mechanics: {status: "unavailable", reason},
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReadOnlyGameModelTab(user);

        expect(await screen.findByText("Id: b")).toBeInTheDocument();
        expect(screen.getAllByText(/Not available — This project's build record has no tracked source/).length).toBe(6);
        expect(screen.queryByRole("button", {name: "Edit"})).not.toBeInTheDocument();
    });

    // A generated build target that also emits a WASM artifact carries the same "generated" provenance and
    // the same GameModelProjection shape as any other introspectable-but-not-editable package (see
    // ProjectDashboardPage's own canViewGameModel doc comment) -- POKIE's own ProjectType.wasm is reserved
    // for a project *resolved as* a bare WASM build target, which carries no capability and can't be opened
    // as a project at all yet (see src/project/ProjectType.ts's own doc comment); a compatible, openable
    // WASM-producing build is a tsPackage from Studio's perspective, exercised the same way as the two
    // fixtures above.
    it("renders a compatible read-only WASM-producing project's game model the same truthful way", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...READ_ONLY_ROUTES,
            "/api/project/inspect": () => ({
                ok: true,
                status: 200,
                body: {
                    packageRoot: "/games/b",
                    valid: true,
                    generated: true,
                    buildInfo: {
                        schemaVersion: 1,
                        generatedBy: "pokie build --target wasm",
                        pokieVersion: "1.3.0",
                        generatedAt: "2026-01-01T00:00:00.000Z",
                        blueprintHash: "sha256:blueprint",
                        source: "/games/b-source/blueprint.json",
                        game: READ_ONLY_GAME,
                    },
                },
            }),
            "/api/project/gameModel": () => ({
                ok: true,
                status: 200,
                body: {
                    basics: {status: "available", data: READ_ONLY_GAME},
                    layout: {status: "available", data: {reels: 3, rows: 3, winModel: {type: "lines"}, paylineCount: 0}},
                    symbols: {status: "available", data: []},
                    reels: {status: "available", data: {generationMode: "default"}},
                    paytable: {status: "available", data: []},
                    betsAndModes: {status: "available", data: {availableBets: [], betModes: []}},
                    mechanics: {status: "available", data: {}},
                },
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReadOnlyGameModelTab(user);

        expect(await screen.findByText("Id: b")).toBeInTheDocument();
        expect(screen.getByText("Reels: 3")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Edit"})).not.toBeInTheDocument();
    });

    it("shows a subject-specific recovery message, never the raw backend text, when loading the project's game model fails", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...READ_ONLY_ROUTES,
            "/api/project/inspect": () => ({
                ok: true,
                status: 200,
                body: {
                    packageRoot: "/games/b",
                    valid: true,
                    generated: true,
                    buildInfo: {
                        schemaVersion: 1,
                        generatedBy: "pokie build",
                        pokieVersion: "1.3.0",
                        generatedAt: "2026-01-01T00:00:00.000Z",
                        blueprintHash: "sha256:blueprint",
                        source: "/games/b-source/blueprint.json",
                        game: READ_ONLY_GAME,
                    },
                },
            }),
            "/api/project/gameModel": () => ({ok: false, status: 500, body: {error: "Studio server crashed unexpectedly"}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToReadOnlyGameModelTab(user);

        expect(
            await screen.findByText("The project's game model could not be completed. Try again, and check the Studio server logs if the problem persists."),
        ).toBeInTheDocument();
        expect(screen.queryByText(/Studio server crashed unexpectedly/)).not.toBeInTheDocument();
    });
});
