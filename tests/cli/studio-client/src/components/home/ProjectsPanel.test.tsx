import {act, fireEvent, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync} from "node:fs";
import {webcrypto} from "node:crypto";
import {join} from "node:path";
import {useState} from "react";
import {useLocation} from "react-router-dom";
import {ProjectsPanel} from "../../../../../../cli/studio-client/src/components/home/ProjectsPanel";
import type {StudioProjectRegistryView} from "../../../../../../cli/studio-client/src/api/types";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import {StudioProjectRegistrationService} from "../../../../../../cli/studio/StudioProjectRegistrationService";
import {StudioFsBrowseService} from "../../../../../../cli/studio/home/StudioFsBrowseService";
import {InMemoryStudioProjectRegistry} from "../../../../../../cli/studio/InMemoryStudioProjectRegistry";
import {createCanonicalWasmFixture} from "../../../../../fixtures/wasm/createCanonicalWasmFixture";
import {createRoutedFakeFetch} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";
import {jobFocusLayout} from "../../testUtils/jobFocusLayout";
import {renderWithProviders} from "../../testUtils/renderWithProviders";

// Covers the Import Project flow this step (P3-POLISH-13) added to the Projects tab -- Detect (a
// read-only preview, never registering anything) -> Register for every supported project with an
// "open" story. PAR workbooks additionally keep their dedicated Design Game import/export route.
// HomePage.test.tsx/openProjectGuard.test.tsx/navigationGuardModal.test.tsx already cover opening an
// already-registered row and the dirty-draft guard around it -- this file is scoped to what's unique to
// Import Project itself.

// Home keeps the Design Game surface mounted while Projects is open. Its automatic validation can
// therefore run during any of these project-only flows, so each routed fetch fixture must cover it.
const AUTOMATIC_VALIDATION_ROUTE = {
    "/api/home/blueprints/validate": () => ({ok: true, status: 200, body: {status: "ok", warnings: []}}),
};

async function goToProjects(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.click(await screen.findByRole("button", {name: "Projects"}));
    await screen.findByText("Add a game you already have");
}

function LocationProbe() {
    const location = useLocation();
    return <output data-testid="location">{JSON.stringify({pathname: location.pathname, state: location.state})}</output>;
}

// Keep the rendered tests connected to the real resolver, canonical-byte checks
// and registry mutations. Only the HTTP transport is replaced; errors are the
// service's actual errors, never canned component results or resolver strings.
describe("V2C-22-SIDECAR-DIAGNOSTICS: rendered Home recovery", () => {
    let directory: string;
    let location: string;
    let sidecar: string;
    let registry: InMemoryStudioProjectRegistry;
    let service: StudioProjectRegistrationService;
    let fixture: ReturnType<typeof createCanonicalWasmFixture>;
    let subtle: PropertyDescriptor | undefined;
    let calls: string[];
    let diagnostics: string[];
    let fetchImpl: FetchLike;

    const repair = (): void => {
        writeFileSync(location, fixture.bytes);
        writeFileSync(sidecar, JSON.stringify(fixture.manifest));
    };
    function replaceWithUnsupported(options: Parameters<typeof createCanonicalWasmFixture>[0]): void {
        const replacement = createCanonicalWasmFixture(options);
        writeFileSync(location, replacement.bytes);
        writeFileSync(sidecar, JSON.stringify(replacement.manifest));
    }
    const contents = (): Buffer[] => [readFileSync(location), ...(readFileSyncOrAbsent(sidecar))];
    function readFileSyncOrAbsent(file: string): Buffer[] {
        try {
            return [readFileSync(file)];
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
            throw error;
        }
    }

    beforeEach(async () => {
        // jsdom has no SubtleCrypto; use real hashing without bypassing integrity.
        subtle = Reflect.getOwnPropertyDescriptor(globalThis.crypto, "subtle");
        Reflect.defineProperty(globalThis.crypto, "subtle", {configurable: true, value: webcrypto.subtle});
        directory = mkdtempSync(join(process.cwd(), "node_modules/.cache/pokie-tmp/home-wasm-"));
        location = join(directory, "game.wasm");
        sidecar = `${location}.pokie-wasm.json`;
        fixture = createCanonicalWasmFixture();
        repair();
        registry = new InMemoryStudioProjectRegistry();
        service = new StudioProjectRegistrationService(registry);
        const preserved = join(directory, "preserved.wasm");
        writeFileSync(preserved, fixture.bytes);
        writeFileSync(`${preserved}.pokie-wasm.json`, JSON.stringify(fixture.manifest));
        await service.registerExternal(preserved, "Preserved game");
        calls = [];
        diagnostics = [];
        fetchImpl = async (url, init) => {
            const route = url.split("?")[0];
            calls.push(route);
            const input = JSON.parse(init?.body ?? "{}") as {location: string; name: string; newLocation: string; projectRoot: string};
            let body: unknown;
            try {
                switch (route) {
                    case "/api/context":
                        body = {mode: "home"};
                        break;
                    case "/api/home/projects/registry":
                        body = await service.list();
                        break;
                    case "/api/home/projects/registry/preview":
                        body = await service.previewImport(input.location);
                        break;
                    case "/api/home/projects/registry/register":
                        body = await service.registerExternal(input.location, input.name);
                        break;
                    case "/api/home/projects/registry/relocate":
                        body = await service.relocate(input.location, input.newLocation);
                        break;
                    case "/api/home/projects/open":
                        await service.recordOpened(input.projectRoot);
                        body = {context: {mode: "project", projectRoot: input.projectRoot}};
                        break;
                    case "/api/home/fs/browse":
                        body = {status: "ok", resolvedPath: location, displayPath: location, entries: [], isDirectory: false};
                        break;
                    default: throw new Error(`Unexpected Home request: ${url}`);
                }
                return {ok: true, status: 200, json: () => Promise.resolve(body)};
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                diagnostics.push(message);
                return {ok: false, status: 400, json: () => Promise.resolve({error: message})};
            }
        };
    });

    afterEach(() => {
        rmSync(directory, {recursive: true, force: true});
        if (subtle) Reflect.defineProperty(globalThis.crypto, "subtle", subtle);
        else Reflect.deleteProperty(globalThis.crypto, "subtle");
    });

    const failures = [
        {category: "missing", cause: "no compatible PokieWasmComponentManifest sidecar was found", guidance: "Add a valid compatible sidecar", breakArtifact: () => unlinkSync(sidecar)},
        {category: "malformed JSON", cause: "is not valid JSON", guidance: "Repair the malformed sidecar", breakArtifact: () => writeFileSync(sidecar, "{broken")},
        {category: "malformed shape", cause: "does not satisfy PokieWasmComponentManifest's own shape", guidance: "Repair the malformed sidecar", breakArtifact: () => writeFileSync(sidecar, "{}")},
        {category: "stale", cause: "does not match its manifest", guidance: "Rebuild the artifact; do not copy a sidecar", breakArtifact: () => writeFileSync(location, createCanonicalWasmFixture({id: "replacement"}).bytes)},
        {category: "incompatible schema", cause: "not compatible with this POKIE build", guidance: "Update the incompatible sidecar", breakArtifact: () => writeFileSync(sidecar, JSON.stringify({...fixture.manifest, schemaVersion: "99.0.0"}))},
        {category: "incompatible runtime", cause: "requires POKIE 99.0.0 or newer", guidance: "Update POKIE or rebuild the artifact", breakArtifact: () => writeFileSync(sidecar, JSON.stringify({...fixture.manifest, minPokieVersion: "99.0.0"}))},
        {category: "incompatible ABI", cause: 'declares ABI "99.0.0"', guidance: "Update the incompatible sidecar", breakArtifact: () => writeFileSync(sidecar, JSON.stringify({...fixture.manifest, artifact: {...fixture.manifest.artifact, abiVersion: "99.0.0"}}))},
        {category: "incompatible serialization", cause: "unsupported serialization identifiers", guidance: "Rebuild the artifact for the supported portable runtime contract", breakArtifact: () => replaceWithUnsupported({serialization: {session: "pokie.session.v2", play: "pokie.play.v2", state: "other.state.v1"}})},
        {category: "incompatible RNG", cause: "unsupported RNG protocol", guidance: "Rebuild the artifact for the supported portable runtime contract", breakArtifact: () => replaceWithUnsupported({host: {rng: "other.rng.v1", services: []}})},
        {category: "incompatible host service", cause: "unsupported required host service", guidance: "Rebuild the artifact for the supported portable runtime contract", breakArtifact: () => replaceWithUnsupported({host: {rng: "pokie.rng.v2", services: ["pokie.clock.v1"]}})},
    ];

    async function expectDiagnostic(failure: typeof failures[number]): Promise<void> {
        const alert = await screen.findByRole("alert");
        expect(alert).toHaveTextContent(failure.cause);
        expect(alert).toHaveTextContent(failure.guidance);
        expect(alert).toHaveTextContent(location);
        if (failure.category.startsWith("malformed") || ["missing", "incompatible schema", "incompatible ABI"].includes(failure.category)) expect(alert).toHaveTextContent(sidecar);
        expect(alert).toHaveTextContent(diagnostics[diagnostics.length - 1]);
        expect(screen.getByText("Preserved game")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Add to projects"})).not.toBeInTheDocument();
    }

    async function checkGame(): Promise<void> {
        fireEvent.click(screen.getByRole("button", {name: "Check game"}));
        await screen.findByRole("button", {name: "Add to projects"});
    }

    it("V36-R8 carries the frozen nonexistent path through the resolver and Check game, then reuses the real registration flow", async () => {
        const missing = "/not/a/real/game";
        const resolver = new StudioFsBrowseService(directory);
        expect(resolver.browse(missing, undefined, "any")).toMatchObject({status: "error", reason: "absent", resolvedPath: missing});
        expect(await service.previewImport(missing)).toEqual({status: "unrecognized", path: missing});
        const observedFetch: FetchLike = (url, init) => {
            if (!url.startsWith("/api/home/fs/browse?")) return fetchImpl(url, init);
            const query = new URL(url, "http://studio").searchParams;
            return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve(resolver.browse(query.get("path") ?? undefined, undefined, "any"))});
        };
        renderWithProviders(<ProjectsPanel />, {fetchImpl: observedFetch});
        await screen.findByText("Preserved game");
        const input = screen.getByRole("textbox", {name: "Game location"});
        fireEvent.change(input, {target: {value: missing}});
        const alert = await screen.findByRole("alert", {name: "Location needs attention"});
        expect(alert).toHaveTextContent(`"${missing}" doesn't exist.`);
        expect(input).toHaveAttribute("aria-errormessage", alert.id);
        fireEvent.click(screen.getByRole("button", {name: "Check game"}));
        await screen.findByText(`Studio couldn't identify "${missing}" as a game it can open. Choose another game folder or game-design file, then try again.`);
        expect(await registry.list()).toHaveLength(1);
        expect(calls).not.toContain("/api/home/projects/registry/register");
        fireEvent.change(input, {target: {value: location}});
        await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
        expect(input).not.toHaveAttribute("aria-invalid");
        await checkGame();
        await checkGame();
        expect(await service.previewImport(location)).toMatchObject({status: "recognized", location});
        expect(resolver.browse(location, undefined, "any")).toMatchObject({status: "ok", resolvedPath: location});
        fireEvent.click(screen.getByRole("button", {name: "Add to projects"}));
        await screen.findByText('Added "game" to Your projects. Select Open to continue working on it.');
        expect(await registry.list()).toHaveLength(2);
    });

    it.each(failures)("Check game preserves $category guidance and permits two corrected previews before registration", async (failure) => {
        failure.breakArtifact();
        const invalid = contents();
        renderWithProviders(<ProjectsPanel />, {fetchImpl});
        await screen.findByText("Preserved game");
        fireEvent.change(screen.getByLabelText("Game location"), {target: {value: location}});
        fireEvent.click(screen.getByRole("button", {name: "Check game"}));
        await expectDiagnostic(failure);
        expect(contents()).toEqual(invalid);
        expect(await registry.list()).toHaveLength(1);
        expect(calls).not.toContain("/api/home/projects/registry/register");

        repair(); // Explicit external correction; Home must never write the source.
        const corrected = contents();
        await checkGame();
        await checkGame();
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(await registry.list()).toHaveLength(1);
        fireEvent.click(screen.getByRole("button", {name: "Add to projects"}));
        await screen.findByText('Added "game" to Your projects. Select Open to continue working on it.');
        expect(contents()).toEqual(corrected);
        expect(await registry.list()).toHaveLength(2);
    });

    it.each(failures)("registration revalidates $category replacement after preview and recovers explicitly", async (failure) => {
        renderWithProviders(<ProjectsPanel />, {fetchImpl});
        await screen.findByText("Preserved game");
        fireEvent.change(screen.getByLabelText("Game location"), {target: {value: location}});
        await checkGame();
        failure.breakArtifact();
        const invalid = contents();
        fireEvent.click(screen.getByRole("button", {name: "Add to projects"}));
        await expectDiagnostic(failure);
        expect(await registry.list()).toHaveLength(1);
        expect(contents()).toEqual(invalid);

        repair();
        const corrected = contents();
        await checkGame();
        fireEvent.click(screen.getByRole("button", {name: "Add to projects"}));
        await screen.findByText('Added "game" to Your projects. Select Open to continue working on it.');
        expect(contents()).toEqual(corrected);
        expect(await registry.list()).toHaveLength(2);
    });

    it.each(failures)("relocation retains the old entry on $category failure and repairs only the registry on retry", async (failure) => {
        await service.registerManaged(location, "Moved game");
        const oldLocation = location;
        const oldSidecar = sidecar;
        location = join(directory, "moved.wasm");
        sidecar = `${location}.pokie-wasm.json`;
        repair();
        unlinkSync(oldLocation);
        failure.breakArtifact();
        const invalid = contents();
        renderWithProviders(<ProjectsPanel />, {fetchImpl});
        await screen.findByText("Moved game (missing)");
        fireEvent.click(screen.getByRole("button", {name: "Relocate"}));
        fireEvent.change(screen.getByLabelText("New location"), {target: {value: location}});
        const submit = screen.getAllByRole("button", {name: "Relocate"}).at(-1)!;
        fireEvent.click(submit);
        await expectDiagnostic(failure);
        expect(screen.getByText("Moved game (missing)")).toBeInTheDocument();
        expect((await registry.list()).map(entry => entry.location)).toContain(oldLocation);
        expect(contents()).toEqual(invalid);

        repair();
        const corrected = contents();
        fireEvent.click(submit);
        await screen.findByRole("button", {name: "Moved game"});
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect((await registry.list()).find(entry => entry.name === "Moved game")).toMatchObject({location, origin: "managed"});
        expect(await registry.list()).toHaveLength(2);
        expect(contents()).toEqual(corrected);
        expect(readFileSync(oldSidecar, "utf8")).toBe(JSON.stringify(fixture.manifest));
    });

    it.each(failures)("registered/recent Open retains $category guidance, row and route until corrected retry", async (failure) => {
        await service.recordOpened(location, "Recent game");
        renderWithProviders(<><ProjectsPanel /><LocationProbe /></>, {fetchImpl, initialEntries: ["/home/projects"]});
        await screen.findByRole("button", {name: "Recent game"});
        failure.breakArtifact(); // The row was valid when rendered; disk is authoritative at Open.
        const invalid = contents();
        const row = screen.getByRole("button", {name: "Recent game"}).closest("tr")!;
        fireEvent.click(within(row).getByRole("button", {name: "Open"}));
        await expectDiagnostic(failure);
        expect(screen.getByTestId("location")).toHaveTextContent('"pathname":"/home/projects"');
        expect(await registry.list()).toHaveLength(2);
        expect(contents()).toEqual(invalid);

        repair();
        const corrected = contents();
        fireEvent.click(within(row).getByRole("button", {name: "Open"}));
        await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent(`/project/${encodeURIComponent(location)}/overview`));
        expect(screen.queryByRole("alert")).not.toBeInTheDocument();
        expect(await registry.list()).toHaveLength(2);
        expect(contents()).toEqual(corrected);
    });
});

describe("ProjectsPanel: Import Project", () => {
    it("renders conversion evidence retained by a registry reload", async () => {
        const evidencePath = "/POKIE Projects/imported/blueprint.json.conversion-evidence.json";
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            "/api/home/projects/registry": () => ({
                ok: true,
                status: 200,
                body: [{
                    location: "/POKIE Projects/imported/blueprint.json",
                    name: "Imported game",
                    type: "blueprint",
                    capabilities: [],
                    origin: "managed",
                    lastOpenedAt: "2026-01-01T00:00:00.000Z",
                    status: "ok",
                    importedFromParSheetPath: "/games/imported.par.xlsx",
                    conversionEvidencePath: evidencePath,
                }],
            }),
        });

        const firstRender = renderWithProviders(<ProjectsPanel />, {fetchImpl});
        expect(await screen.findByText(`Conversion evidence: ${evidencePath}`)).toBeInTheDocument();

        firstRender.unmount();
        renderWithProviders(<ProjectsPanel />, {fetchImpl});
        expect(await screen.findByText(`Conversion evidence: ${evidencePath}`)).toBeInTheDocument();
        expect(calls.filter((call) => call.url.startsWith("/api/home/projects/registry?"))).toHaveLength(2);
    });

    it("shows project-list recovery for an HTTP failure and reloads the list when retried", async () => {
        const user = userEvent.setup();
        let attempts = 0;
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            "/api/home/projects/registry": () => {
                attempts++;
                return attempts === 1
                    ? {ok: false, status: 503, body: {error: "registry service unavailable"}}
                    : {
                        ok: true,
                        status: 200,
                        body: [{location: "/games/recovered", name: "Recovered game", type: "tsPackage", capabilities: [], origin: "managed", lastOpenedAt: "2026-01-01T00:00:00.000Z", status: "ok"}],
                    };
            },
        });
        renderWithProviders(<ProjectsPanel />, {fetchImpl});

        expect(await screen.findByRole("alert")).toHaveTextContent("Your projects list couldn't be completed. Try again. If it continues, reopen the project and retry.");
        expect(screen.getByRole("button", {name: "Try loading projects again"})).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Try loading projects again"}));

        expect(await screen.findByText("Recovered game")).toBeInTheDocument();
        expect(calls.filter((call) => call.url.startsWith("/api/home/projects/registry?"))).toHaveLength(2);
    });

    it("renders the resolver's actionable unavailable WASM reason and never offers an open action", async () => {
        const reason = "The WASM sidecar is malformed; repair its JSON.";
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            "/api/home/projects/registry": () => ({
                ok: true,
                status: 200,
                body: [{
                    location: "/games/component.wasm",
                    name: "Component",
                    type: "wasm",
                    capabilities: ["wasm.manifest.read"],
                    origin: "external",
                    lastOpenedAt: "2026-01-01T00:00:00.000Z",
                    status: "unavailable",
                    unavailableReason: reason,
                    wasmPresentation: {
                        label: "WASM component (inspection-only)",
                        manifestCapability: "wasm.manifest.read",
                        manifestCapabilityLabel: "Inspect declared WASM component metadata",
                        inspectActionLabel: "Inspect declared manifest",
                        inspectionSummary: "inspection-only",
                    },
                }],
            }),
        });
        renderWithProviders(<ProjectsPanel />, {fetchImpl});

        const row = (await screen.findByText("Component")).closest("tr") as HTMLElement;
        expect(within(row).getByText(reason)).toBeInTheDocument();
        expect(within(row).queryByRole("button", {name: /inspect|open/i})).not.toBeInTheDocument();
    });

    it("renders a compatible component's contract type and inspection action without a client fallback", async () => {
        const user = userEvent.setup();
        const wasmPresentation = {
            label: "WASM component (inspection-only)",
            manifestCapability: "wasm.manifest.read",
            manifestCapabilityLabel: "Inspect declared WASM component metadata",
            inspectActionLabel: "Inspect declared manifest",
            inspectionSummary: "POKIE reads compatible component metadata only.",
        };
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            "/api/home/projects/registry": () => ({
                ok: true,
                status: 200,
                body: [{
                    location: "/games/component.wasm",
                    name: "Compatible component",
                    type: "wasm",
                    capabilities: ["wasm.manifest.read"],
                    origin: "external",
                    lastOpenedAt: "2026-01-01T00:00:00.000Z",
                    status: "ok",
                    wasmPresentation,
                }],
            }),
        });
        renderWithProviders(<ProjectsPanel />, {fetchImpl});

        const row = (await screen.findByText("Compatible component")).closest("tr") as HTMLElement;
        expect(within(row).getByText(wasmPresentation.label)).toBeInTheDocument();
        expect(within(row).getByRole("button", {name: wasmPresentation.inspectActionLabel})).toBeInTheDocument();
        await user.click(screen.getByRole("combobox", {name: "Game type"}));
        expect(screen.getByRole("option", {name: wasmPresentation.label, hidden: true})).toBeInTheDocument();
    });

    it("renders a canonical WASM artifact as an ordinary Open project", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            "/api/home/projects/registry": () => ({
                ok: true,
                status: 200,
                body: [{
                    location: "/games/canonical.wasm",
                    name: "Canonical component",
                    type: "wasm",
                    capabilities: ["wasm.manifest.read", "wasm.canonical", "wasm.runtime.execute"],
                    origin: "external",
                    lastOpenedAt: "2026-01-01T00:00:00.000Z",
                    status: "ok",
                }],
            }),
        });
        renderWithProviders(<ProjectsPanel />, {fetchImpl});

        const row = (await screen.findByText("Canonical component")).closest("tr") as HTMLElement;
        expect(within(row).getByRole("button", {name: "Open"})).toBeInTheDocument();
        expect(within(row).queryByRole("button", {name: /inspect/i})).not.toBeInTheDocument();
    });

    it("uses the recognized component's contract label before registration and preserves its inspection action after registration", async () => {
        const user = userEvent.setup();
        const wasmPresentation = {
            label: "WASM component (inspection-only)",
            manifestCapability: "wasm.manifest.read",
            manifestCapabilityLabel: "Inspect declared WASM component metadata",
            inspectActionLabel: "Inspect declared manifest",
            inspectionSummary: "POKIE reads compatible component metadata only.",
        };
        const location = "/games/component.wasm";
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/projects/registry/preview": () => ({
                ok: true,
                status: 200,
                body: {status: "recognized", location, type: "wasm", capabilities: ["wasm.manifest.read"], suggestedName: "component", wasmPresentation},
            }),
            "/api/home/projects/registry/register": () => ({
                ok: true,
                status: 201,
                body: {
                    status: "ok",
                    entry: {
                        location,
                        name: "component",
                        type: "wasm",
                        capabilities: ["wasm.manifest.read"],
                        origin: "external",
                        lastOpenedAt: "2026-01-01T00:00:00.000Z",
                        status: "ok",
                        wasmPresentation,
                    },
                },
            }),
        });
        renderWithProviders(<ProjectsPanel />, {fetchImpl});

        await user.type(screen.getByLabelText("Game location", {exact: false}), location);
        await user.click(screen.getByRole("button", {name: "Check game"}));
        expect(await screen.findByText((_, element) => element?.textContent === `Found a ${wasmPresentation.label} at ${location}.`)).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Add to projects"}));
        expect(await screen.findByRole("button", {name: wasmPresentation.inspectActionLabel})).toBeInTheDocument();
    });

    it("detects a recognized package, prefills the suggested name, and Register adds it to the list", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            ...AUTOMATIC_VALIDATION_ROUTE,
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/projects/registry/preview": () => ({
                ok: true,
                status: 200,
                body: {status: "recognized", location: "/games/a", type: "tsPackage", capabilities: ["multiMode"], suggestedName: "a"},
            }),
            "/api/home/projects/registry/register": () => ({
                ok: true,
                status: 201,
                body: {
                    status: "ok",
                    entry: {
                        location: "/games/a",
                        name: "a",
                        type: "tsPackage",
                        capabilities: ["multiMode"],
                        origin: "external",
                        lastOpenedAt: "2026-01-01T00:00:00.000Z",
                        status: "ok",
                    },
                },
            }),
        });
        renderWithProviders(<ProjectsPanel />, {fetchImpl});

        await user.type(screen.getByLabelText("Game location", {exact: false}), "/games/a");
        await user.click(screen.getByRole("button", {name: "Check game"}));

        expect(await screen.findByText(/Found a Playable game at/)).toBeInTheDocument();
        const nameInput = screen.getByLabelText("Name") as HTMLInputElement;
        expect(nameInput.value).toBe("a");

        await user.click(screen.getByRole("button", {name: "Add to projects"}));

        await waitFor(() =>
            expect(calls).toContainEqual(
                expect.objectContaining({
                    url: "/api/home/projects/registry/register",
                    init: expect.objectContaining({body: JSON.stringify({location: "/games/a", name: "a"})}),
                }),
            ),
        );
        expect(await screen.findByText('Added "a" to Your projects. Select Open to continue working on it.')).toBeInTheDocument();
        expect(await screen.findByText("a")).toBeInTheDocument();
    });

    it("renders an explicit Detecting state while a preview request is in flight", async () => {
        const user = userEvent.setup();
        const fetchImpl = (url: string) => {
            if (url.startsWith("/api/home/projects/registry?")) {
                return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
            }
            if (url === "/api/home/projects/registry/preview") {
                return new Promise<never>(() => {
                    // Intentionally remains pending while the UI exposes its in-flight state.
                });
            }
            throw new Error(`Unexpected request: ${url}`);
        };
        renderWithProviders(<ProjectsPanel />, {fetchImpl});

        await user.type(screen.getByLabelText("Game location", {exact: false}), "/games/a");
        await user.click(screen.getByRole("button", {name: "Check game"}));

        // The empty project registry also owns a polite status region. Assert against this
        // import flow's unique, visible copy rather than whichever status mounted first.
        expect(await screen.findByText("Checking this game…")).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Check game"})).toBeDisabled();
    });

    it("settles an unresponsive preview into an actionable error", async () => {
        jest.useFakeTimers();
        try {
            const fetchImpl = (url: string) => {
                if (url.startsWith("/api/home/projects/registry?")) {
                    return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve([])});
                }
                if (url === "/api/home/projects/registry/preview") {
                    return new Promise<never>(() => {
                        // Intentionally remains pending until the timeout settles the UI.
                    });
                }
                if (url.startsWith("/api/home/fs/browse")) {
                    return Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "error", reason: "absent", resolvedPath: "/games/a"})});
                }
                throw new Error(`Unexpected request: ${url}`);
            };
            renderWithProviders(<ProjectsPanel />, {fetchImpl});

            await act(async () => {
                await Promise.resolve();
            });
            await act(async () => {
                fireEvent.change(screen.getByLabelText("Game location", {exact: false}), {target: {value: "/games/a"}});
                fireEvent.click(screen.getByRole("button", {name: "Check game"}));
                await Promise.resolve();
            });

            await act(async () => {
                jest.advanceTimersByTime(15_000);
                await Promise.resolve();
            });

            expect(screen.getByRole("alert", {name: "Location needs attention"})).toHaveTextContent('"/games/a" doesn\'t exist.');
            const timeout = screen.getByText("That game location could not be completed. Try again. If it continues, choose the location again and retry.");
            expect(timeout.closest('[role="alert"]')).toBeInTheDocument();
            expect(screen.getByRole("button", {name: "Check game"})).not.toBeDisabled();
        } finally {
            jest.useRealTimers();
        }
    });

    it("registers a recognized PAR sheet so its registered row can open the Build/Export dashboard", async () => {
        const user = userEvent.setup();
        const location = "/games/sheet.xlsx";
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            ...AUTOMATIC_VALIDATION_ROUTE,
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/projects/registry/preview": () => ({
                ok: true,
                status: 200,
                body: {status: "recognized", location, type: "parWorkbook", capabilities: [], suggestedName: "sheet"},
            }),
            "/api/home/projects/registry/register": () => ({
                ok: true,
                status: 201,
                body: {
                    status: "ok",
                    entry: {
                        location,
                        name: "sheet",
                        type: "parWorkbook",
                        capabilities: ["parWorkbook.exchange"],
                        origin: "external",
                        lastOpenedAt: "2026-01-01T00:00:00.000Z",
                        status: "ok",
                    },
                },
            }),
            "/api/home/projects/open": () => ({
                ok: true,
                status: 200,
                body: {context: {mode: "project", projectRoot: location}},
            }),
            "/api/project/context": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "artifact",
                    projectRoot: location,
                    project: {type: "parWorkbook", rootPath: location, capabilities: ["parWorkbook.exchange"], provenance: "registered workbook"},
                },
            }),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: location, valid: true, generated: false}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/artifacts/targets": () => ({
                ok: true,
                status: 200,
                body: [
                    {target: "tsPackage", supported: false, state: "diagnostic-required", diagnostic: "A TypeScript package requires a Blueprint.", unsupportedNotes: []},
                    {target: "outcomeLibrary", supported: false, state: "diagnostic-required", diagnostic: "An Outcome library requires a runtime source.", unsupportedNotes: []},
                    {target: "stakeAdapter", supported: false, state: "diagnostic-required", diagnostic: "A Stake export requires an Outcome library.", unsupportedNotes: []},
                    {target: "parWorkbook", supported: true, state: "supported", unsupportedNotes: []},
                ],
            }),
            "/api/project/artifacts/preview": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    target: "parWorkbook",
                    destination: "/games/republished-sheet.xlsx",
                    destinationKind: "file",
                    plannedOutputs: ["PAR workbook (.xlsx) file"],
                    sourceType: "parWorkbook",
                },
            }),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await goToProjects(user);

        await user.type(screen.getByLabelText("Game location", {exact: false}), location);
        await user.click(screen.getByRole("button", {name: "Check game"}));

        expect(await screen.findByText(/Found a PAR spreadsheet at/)).toBeInTheDocument();
        expect(screen.getByRole("button", {name: "Add to projects"})).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Add to projects"}));

        await waitFor(() =>
            expect(calls).toContainEqual(
                expect.objectContaining({
                    url: "/api/home/projects/registry/register",
                    init: expect.objectContaining({body: JSON.stringify({location, name: "sheet"})}),
                }),
            ),
        );
        const row = (await screen.findAllByText("sheet"))
            .map((element) => element.closest("tr"))
            .find((candidate): candidate is HTMLTableRowElement => candidate !== null) as HTMLElement;
        await user.click(within(row).getByRole("button", {name: "Open"}));

        await waitFor(() =>
            expect(calls).toContainEqual(
                expect.objectContaining({
                    url: "/api/home/projects/open",
                    init: expect.objectContaining({body: JSON.stringify({projectRoot: location})}),
                }),
            ),
        );
        expect(await screen.findByRole("heading", {name: "PAR spreadsheet"})).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Build/Export"}));

        const buildArtifactSection = (await screen.findByText("Build artifact")).closest("fieldset") as HTMLElement;
        expect(await within(buildArtifactSection).findByText("PAR sheet (.xlsx)")).toBeInTheDocument();
        expect(within(buildArtifactSection).getByText(/republished-sheet\.xlsx/)).toBeInTheDocument();
        expect(within(buildArtifactSection).getByRole("button", {name: "Build"})).toBeEnabled();
    });

    it("picks a PAR workbook through the native file picker, then detects and retains its Design Game route", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/fs/default-location": () => ({ok: true, status: 200, body: {status: "unavailable"}}),
            "/api/home/fs/native-browse/availability": () => ({ok: true, status: 200, body: {status: "available"}}),
            "/api/home/fs/native-browse": () => ({ok: true, status: 200, body: {status: "selected", path: "/games/native-sheet.xlsx"}}),
            "/api/home/projects/registry/preview": () => ({
                ok: true,
                status: 200,
                body: {status: "recognized", location: "/games/native-sheet.xlsx", type: "parWorkbook", capabilities: [], suggestedName: "native-sheet"},
            }),
        });
        renderWithProviders(
            <>
                <ProjectsPanel />
                <LocationProbe />
            </>,
            {fetchImpl},
        );

        await user.click(screen.getByRole("button", {name: "Browse PAR sheet…"}));
        expect(await screen.findByDisplayValue("/games/native-sheet.xlsx")).toBeInTheDocument();

        const pickCall = calls.find((call) => call.url === "/api/home/fs/native-browse");
        expect(JSON.parse(String(pickCall?.init?.body))).toEqual({
            kind: "file",
            mode: "open",
            fileFilters: [{name: "PAR sheets", extensions: ["xlsx"]}],
        });

        await user.click(screen.getByRole("button", {name: "Check game"}));
        expect(await screen.findByText(/Found a PAR spreadsheet at/)).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Open in Start a game"}));

        await waitFor(() =>
            expect(JSON.parse(screen.getByTestId("location").textContent ?? "{}")).toEqual({
                pathname: "/home/design",
                state: {initialParSheetPath: "/games/native-sheet.xlsx"},
            }),
        );
    });

    it("leaves the imported location unchanged without opening the fallback browser when the native PAR picker is cancelled", async () => {
        const user = userEvent.setup();
        const selectedLocation = "/games/already-selected.xlsx";
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", resolvedPath: selectedLocation, displayPath: selectedLocation, entries: [], isDirectory: false},
            }),
            "/api/home/fs/native-browse/availability": () => ({ok: true, status: 200, body: {status: "available"}}),
            "/api/home/fs/native-browse": () => ({ok: true, status: 200, body: {status: "cancelled"}}),
        });
        renderWithProviders(<ProjectsPanel />, {fetchImpl});

        await user.type(screen.getByLabelText("Game location", {exact: false}), selectedLocation);
        await user.click(screen.getByRole("button", {name: "Browse PAR sheet…"}));

        await waitFor(() => expect(calls.some((call) => call.url === "/api/home/fs/native-browse")).toBe(true));
        expect(screen.getByDisplayValue(selectedLocation)).toBeInTheDocument();
        expect(screen.queryByText("Server filesystem browser")).not.toBeInTheDocument();
    });

    it("falls back to file-only server selection when the native PAR picker is unavailable", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/fs/default-location": () => ({ok: true, status: 200, body: {status: "unavailable"}}),
            "/api/home/fs/native-browse/availability": () => ({ok: true, status: 200, body: {status: "unavailable", reason: "No display"}}),
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    resolvedPath: "/games",
                    displayPath: "/games",
                    entries: [{name: "fallback-sheet.xlsx", isDirectory: false}],
                    isDirectory: true,
                },
            }),
        });
        renderWithProviders(<ProjectsPanel />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Browse PAR sheet…"}));

        expect(await screen.findByText("Server filesystem browser")).toBeInTheDocument();
        expect(await screen.findByText("fallback-sheet.xlsx")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Select this folder"})).not.toBeInTheDocument();
        await user.click(screen.getByText("fallback-sheet.xlsx"));
        expect(screen.getByDisplayValue("/games/fallback-sheet.xlsx")).toBeInTheDocument();
        expect(calls.some((call) => call.url === "/api/home/fs/native-browse")).toBe(false);
    });

    it("falls back to file-only server selection when the native PAR picker request fails", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/fs/default-location": () => ({ok: true, status: 200, body: {status: "unavailable"}}),
            "/api/home/fs/native-browse/availability": () => ({ok: true, status: 200, body: {status: "available"}}),
            "/api/home/fs/native-browse": () => ({ok: true, status: 200, body: {status: "error", message: "Picker failed"}}),
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    resolvedPath: "/games",
                    displayPath: "/games",
                    entries: [{name: "error-fallback-sheet.xlsx", isDirectory: false}],
                    isDirectory: true,
                },
            }),
        });
        renderWithProviders(<ProjectsPanel />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Browse PAR sheet…"}));

        expect(await screen.findByText("Server filesystem browser")).toBeInTheDocument();
        expect(await screen.findByText("error-fallback-sheet.xlsx")).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Select this folder"})).not.toBeInTheDocument();
        await user.click(screen.getByText("error-fallback-sheet.xlsx"));
        expect(screen.getByDisplayValue("/games/error-fallback-sheet.xlsx")).toBeInTheDocument();
        const pickCall = calls.find((call) => call.url === "/api/home/fs/native-browse");
        expect(JSON.parse(String(pickCall?.init?.body))).toMatchObject({
            kind: "file",
            mode: "open",
            fileFilters: [{name: "PAR sheets", extensions: ["xlsx"]}],
        });
    });

    it("keeps the ordinary Import Project Browse picker generic for files and folders", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/fs/default-location": () => ({ok: true, status: 200, body: {status: "unavailable"}}),
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    resolvedPath: "/games",
                    displayPath: "/games",
                    entries: [{name: "generic-sheet.xlsx", isDirectory: false}],
                    isDirectory: true,
                },
            }),
        });
        renderWithProviders(<ProjectsPanel />, {fetchImpl});

        await user.click(screen.getByRole("button", {name: "Browse…"}));

        expect(await screen.findByText("generic-sheet.xlsx")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Select this folder"}));
        expect(screen.getByDisplayValue("/games")).toBeInTheDocument();

        // Mantine keeps the first modal mounted through its exit transition. Wait for that picker to
        // finish closing so the second selection cannot target its stale, now-closing entry.
        await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());

        await user.click(screen.getByRole("button", {name: "Browse…"}));
        await user.click(await screen.findByText("generic-sheet.xlsx"));
        expect(screen.getByDisplayValue("/games/generic-sheet.xlsx")).toBeInTheDocument();
        expect(calls.some((call) => call.url === "/api/home/fs/native-browse")).toBe(false);
    });

    it("shows a not-recognized message for a path that isn't any known project type, without registering anything", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            ...AUTOMATIC_VALIDATION_ROUTE,
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/projects/registry/preview": () => ({ok: true, status: 200, body: {status: "unrecognized", path: "/tmp/nothing"}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await goToProjects(user);

        await user.type(screen.getByLabelText("Game location", {exact: false}), "/tmp/nothing");
        await user.click(screen.getByRole("button", {name: "Check game"}));

        expect(await screen.findByText(/Studio couldn't identify "\/tmp\/nothing" as a game it can open/)).toBeInTheDocument();
        expect(calls.some((call) => call.url === "/api/home/projects/registry/register")).toBe(false);
    });

    it("accepts a Blueprint file path with no folder-only warning, requesting kind=any (not directory-only) for its resolved-path hint", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            ...AUTOMATIC_VALIDATION_ROUTE,
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", resolvedPath: "/games/blueprint.json", displayPath: "./blueprint.json", entries: [], isDirectory: false},
            }),
            "/api/home/projects/registry/preview": () => ({
                ok: true,
                status: 200,
                body: {status: "recognized", location: "/games/blueprint.json", type: "blueprint", capabilities: [], suggestedName: "blueprint"},
            }),
            "/api/home/projects/registry/register": () => ({
                ok: true,
                status: 201,
                body: {
                    status: "ok",
                    entry: {
                        location: "/games/blueprint.json",
                        name: "blueprint",
                        type: "blueprint",
                        capabilities: [],
                        origin: "external",
                        lastOpenedAt: "2026-01-01T00:00:00.000Z",
                        status: "ok",
                    },
                },
            }),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await goToProjects(user);

        await user.type(screen.getByLabelText("Game location", {exact: false}), "/games/blueprint.json");

        expect(await screen.findByText("Resolves to: /games/blueprint.json")).toBeInTheDocument();
        expect(screen.queryByText(/is a file, not a folder/)).not.toBeInTheDocument();
        expect(calls.some((call) => call.url === "/api/home/fs/browse?path=%2Fgames%2Fblueprint.json&kind=any")).toBe(true);

        await user.click(screen.getByRole("button", {name: "Check game"}));

        expect(await screen.findByText(/Found a Game design at/)).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Add to projects"}));

        expect(await screen.findByText('Added "blueprint" to Your projects. Select Open to continue working on it.')).toBeInTheDocument();
    });

    it("registers an imported Blueprint file and Open lands it on its Studio project workspace, same as a package", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            ...AUTOMATIC_VALIDATION_ROUTE,
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", resolvedPath: "/games/blueprint.json", displayPath: "./blueprint.json", entries: [], isDirectory: false},
            }),
            "/api/home/projects/registry/preview": () => ({
                ok: true,
                status: 200,
                body: {status: "recognized", location: "/games/blueprint.json", type: "blueprint", capabilities: [], suggestedName: "blueprint"},
            }),
            "/api/home/projects/registry/register": () => ({
                ok: true,
                status: 201,
                body: {
                    status: "ok",
                    entry: {
                        location: "/games/blueprint.json",
                        name: "blueprint",
                        type: "blueprint",
                        capabilities: [],
                        origin: "external",
                        lastOpenedAt: "2026-01-01T00:00:00.000Z",
                        status: "ok",
                    },
                },
            }),
            "/api/home/projects/open": () => ({
                ok: true,
                status: 200,
                body: {context: {mode: "project", projectRoot: "/games/blueprint.json"}, manifest: {id: "blueprint", name: "blueprint", version: "0.1.0"}},
            }),
            "/api/project/context": () => ({
                ok: true,
                status: 200,
                body: {status: "loaded", projectRoot: "/games/blueprint.json", game: {id: "blueprint", name: "blueprint", version: "0.1.0"}},
            }),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/blueprint.json", valid: true}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await goToProjects(user);

        await user.type(screen.getByLabelText("Game location", {exact: false}), "/games/blueprint.json");
        await user.click(screen.getByRole("button", {name: "Check game"}));

        expect(await screen.findByText(/Found a Game design at/)).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Add to projects"}));
        expect(await screen.findByText('Added "blueprint" to Your projects. Select Open to continue working on it.')).toBeInTheDocument();

        // The freshly registered Blueprint row gets the same Open action a Package row does -- not just
        // Remove (StudioHomeService.openProject materializes a "blueprint" location into a real runtime
        // before loading it, so it reaches the exact same Project Dashboard a Package does).
        const open = screen.getByRole("button", {name: "Open"});
        expect(open).toHaveAttribute("id", "project-open:/games/blueprint.json");
        expect(open).toHaveAttribute("data-pokie-project-location", "/games/blueprint.json");
        expect(open).toHaveAttribute("type", "button");
        open.focus();
        await user.keyboard("[Space>]");
        expect(calls.filter((call) => call.url === "/api/home/projects/open")).toHaveLength(0);
        await user.keyboard("[/Space]");

        await waitFor(() =>
            expect(calls).toContainEqual(
                expect.objectContaining({
                    url: "/api/home/projects/open",
                    init: expect.objectContaining({body: JSON.stringify({projectRoot: "/games/blueprint.json"})}),
                }),
            ),
        );
        expect(calls.filter((call) => call.url === "/api/home/projects/open")).toHaveLength(1);
        expect(await screen.findByRole("heading", {name: "blueprint"})).toBeInTheDocument();
        expect(within(screen.getByRole("navigation", {name: "Sections"})).getByRole("button", {name: "Overview"})).toBeInTheDocument();
        expect(within(screen.getByRole("navigation", {name: "Sections"})).getByRole("button", {name: "Game Model"})).toBeInTheDocument();
    });

    it("accepts a package directory path with no file-only warning, requesting kind=any for its resolved-path hint", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            ...AUTOMATIC_VALIDATION_ROUTE,
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: []}),
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", resolvedPath: "/games/a", displayPath: "./a", entries: [{name: "package.json", isDirectory: false}], isDirectory: true},
            }),
            "/api/home/projects/registry/preview": () => ({
                ok: true,
                status: 200,
                body: {status: "recognized", location: "/games/a", type: "tsPackage", capabilities: ["multiMode"], suggestedName: "a"},
            }),
            "/api/home/projects/registry/register": () => ({
                ok: true,
                status: 201,
                body: {
                    status: "ok",
                    entry: {
                        location: "/games/a",
                        name: "a",
                        type: "tsPackage",
                        capabilities: ["multiMode"],
                        origin: "external",
                        lastOpenedAt: "2026-01-01T00:00:00.000Z",
                        status: "ok",
                    },
                },
            }),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await goToProjects(user);

        await user.type(screen.getByLabelText("Game location", {exact: false}), "/games/a");

        expect(await screen.findByText("Resolves to: /games/a")).toBeInTheDocument();
        expect(screen.queryByText(/is a directory, not a file/)).not.toBeInTheDocument();
        expect(calls.some((call) => call.url === "/api/home/fs/browse?path=%2Fgames%2Fa&kind=any")).toBe(true);

        await user.click(screen.getByRole("button", {name: "Check game"}));

        expect(await screen.findByText(/Found a Playable game at/)).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Add to projects"}));

        expect(await screen.findByText('Added "a" to Your projects. Select Open to continue working on it.')).toBeInTheDocument();
    });

    it("removes a registered entry after confirming, without deleting anything on disk", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            ...AUTOMATIC_VALIDATION_ROUTE,
            "/api/home/projects/registry": () => ({
                ok: true,
                status: 200,
                body: [
                    {
                        location: "/games/a",
                        name: "A",
                        type: "tsPackage",
                        capabilities: [],
                        origin: "managed",
                        lastOpenedAt: "2026-01-01T00:00:00.000Z",
                        status: "ok",
                    },
                ],
            }),
            "/api/home/projects/registry/remove": () => ({ok: true, status: 200, body: {status: "ok"}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await goToProjects(user);

        // The Recommended Design Game model remains mounted while Projects is visible and legitimately
        // contains the symbol "A" too. Wait for this row's own visible action rather than globally
        // querying ambiguous text from the hidden editor.
        await user.click(await screen.findByRole("button", {name: "Remove"}));

        expect(await screen.findByText('Remove "A" from Projects? This only forgets it here -- nothing on disk is deleted.')).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Confirm"}));

        await waitFor(() =>
            expect(calls).toContainEqual(
                expect.objectContaining({
                    url: "/api/home/projects/registry/remove",
                    init: expect.objectContaining({body: JSON.stringify({location: "/games/a"})}),
                }),
            ),
        );
        expect(await screen.findByText("No games yet. Start a game or add one you already have.")).toBeInTheDocument();
    });

    it("repairs a missing managed entry from the rendered Relocate confirmation without leaving the old row behind", async () => {
        const user = userEvent.setup();
        const oldLocation = "/games/managed/blueprint.json";
        const newLocation = "/moved/managed/blueprint.json";
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            ...AUTOMATIC_VALIDATION_ROUTE,
            "/api/home/projects/registry": () => ({
                ok: true,
                status: 200,
                body: [
                    {
                        location: oldLocation,
                        name: "My managed game",
                        type: "blueprint",
                        capabilities: ["blueprint.build"],
                        origin: "managed",
                        lastOpenedAt: "2026-01-01T00:00:00.000Z",
                        status: "missing",
                    },
                ],
            }),
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", resolvedPath: newLocation, displayPath: newLocation, entries: [], isDirectory: false},
            }),
            "/api/home/projects/registry/relocate": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    entry: {
                        location: newLocation,
                        name: "My managed game",
                        type: "blueprint",
                        capabilities: ["blueprint.build"],
                        origin: "managed",
                        lastOpenedAt: "2026-01-02T00:00:00.000Z",
                        status: "ok",
                    },
                },
            }),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await goToProjects(user);

        await screen.findByText("My managed game (missing)");
        await user.click(screen.getByRole("button", {name: "Relocate"}));
        await user.type(screen.getByLabelText("New location"), newLocation);
        const relocateButtons = screen.getAllByRole("button", {name: "Relocate"});
        await user.click(relocateButtons[relocateButtons.length - 1]);

        await waitFor(() =>
            expect(calls).toContainEqual(
                expect.objectContaining({
                    url: "/api/home/projects/registry/relocate",
                    init: expect.objectContaining({body: JSON.stringify({location: oldLocation, newLocation})}),
                }),
            ),
        );
        expect(await screen.findByText(newLocation)).toBeInTheDocument();
        expect(screen.queryByText("My managed game (missing)")).not.toBeInTheDocument();
        expect(screen.getAllByText("My managed game")).toHaveLength(1);
    });

    it("keeps a missing game available when its new location is not recognized", async () => {
        const user = userEvent.setup();
        const oldLocation = "/games/missing/slot.json";
        const newLocation = "/moved/not-a-game";
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            ...AUTOMATIC_VALIDATION_ROUTE,
            "/api/home/projects/registry": () => ({
                ok: true,
                status: 200,
                body: [{
                    location: oldLocation,
                    name: "Missing game",
                    type: "blueprint",
                    capabilities: ["blueprint.build"],
                    origin: "external",
                    lastOpenedAt: "2026-01-01T00:00:00.000Z",
                    status: "missing",
                }],
            }),
            "/api/home/fs/browse": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", resolvedPath: newLocation, displayPath: newLocation, entries: [], isDirectory: false},
            }),
            "/api/home/projects/registry/relocate": () => ({
                ok: true,
                status: 200,
                body: {status: "unrecognized", path: newLocation},
            }),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await goToProjects(user);

        await screen.findByText("Missing game (missing)");
        await user.click(screen.getByRole("button", {name: "Relocate"}));
        await user.type(screen.getByLabelText("New location"), newLocation);
        const relocateButtons = screen.getAllByRole("button", {name: "Relocate"});
        await user.click(relocateButtons[relocateButtons.length - 1]);

        await waitFor(() =>
            expect(calls).toContainEqual(
                expect.objectContaining({
                    url: "/api/home/projects/registry/relocate",
                    init: expect.objectContaining({body: JSON.stringify({location: oldLocation, newLocation})}),
                }),
            ),
        );
        expect(await screen.findByText(`"${newLocation}" isn't a recognized game location. Choose another location or retry.`)).toBeInTheDocument();
        expect(screen.getByText("Missing game (missing)")).toBeInTheDocument();
        expect(screen.queryByText(/POKIE project/i)).not.toBeInTheDocument();
    });

    it("groups a large registry, searches it, and pages the bounded results", async () => {
        const user = userEvent.setup();
        const entries = Array.from({length: 12}, (_, index) => ({
            location: `/games/project-${index + 1}`,
            name: index === 0 ? "Missing registry" : `Project ${index + 1}`,
            type: index === 1 ? "blueprint" : "tsPackage" as const,
            capabilities: [],
            origin: "external" as const,
            lastOpenedAt: "2026-01-01T00:00:00.000Z",
            status: index === 0 ? "missing" : "ok" as const,
        }));
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: entries}),
        });
        renderWithProviders(<ProjectsPanel />, {fetchImpl});

        expect(await screen.findByText("Available projects")).toBeInTheDocument();
        expect(screen.getByText("Needs attention", {selector: ".project-registry-group *"})).toBeInTheDocument();
        expect(screen.getByText("Showing 1–10 of 12 projects")).toBeInTheDocument();
        expect(screen.queryByText("Project 12")).not.toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Next page"}));
        expect(await screen.findByText("Project 12")).toBeInTheDocument();
        expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();

        await user.type(screen.getByLabelText("Search projects"), "Missing registry");
        expect(await screen.findByText("Showing 1–1 of 1 projects")).toBeInTheDocument();
        expect(screen.getByText("Missing registry (missing)")).toBeInTheDocument();
        expect(screen.queryByText("Project 12")).not.toBeInTheDocument();
    });

    it("uses clear user-facing wording for how each project was added", async () => {
        const {fetchImpl} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            "/api/home/projects/registry": () => ({
                ok: true,
                status: 200,
                body: [
                    {location: "/games/available", name: "Available game", type: "tsPackage", capabilities: [], origin: "managed", lastOpenedAt: "2026-01-01T00:00:00.000Z", status: "ok"},
                    {location: "/games/missing", name: "Missing game", type: "blueprint", capabilities: [], origin: "external", lastOpenedAt: "2026-01-01T00:00:00.000Z", status: "missing"},
                ],
            }),
        });
        renderWithProviders(<ProjectsPanel />, {fetchImpl});

        const availableRow = (await screen.findByText("Available game")).closest("tr");
        const missingRow = screen.getByText("Missing game (missing)").closest("tr");
        expect(availableRow).toHaveClass("project-registry-entry");
        expect(within(availableRow as HTMLElement).getByText("Available")).toBeInTheDocument();
        expect(within(missingRow as HTMLElement).getByText("Needs attention")).toBeInTheDocument();
        expect(within(availableRow as HTMLElement).getByText("Created in Studio")).toBeInTheDocument();
        expect(within(missingRow as HTMLElement).getByText("Added from your computer")).toBeInTheDocument();
        expect(screen.getByRole("columnheader", {name: "Added to Studio"})).toBeInTheDocument();
        expect(screen.queryByText("Origin")).not.toBeInTheDocument();
        expect(screen.queryByText("Managed")).not.toBeInTheDocument();
        expect(screen.queryByText("Registered")).not.toBeInTheDocument();
        expect(within(availableRow as HTMLElement).getByText("Available game").closest("td")).toHaveAttribute("data-label", "Project");
        expect(within(availableRow as HTMLElement).getByText("Created in Studio").closest("td")).toHaveAttribute("data-label", "Added to Studio");
        expect(within(availableRow as HTMLElement).getByRole("button", {name: "Open"}).closest("td")).toHaveAttribute("data-label", "Actions");
        expect(within(missingRow as HTMLElement).getByRole("checkbox", {name: "Select missing project Missing game"}).closest("td")).toHaveAttribute("data-label", "Select");
    });

    it.each([
        ["outcomeLibrary", "Outcome library", "/games/outcomes"],
        ["stakeAdapter", "Stake Engine export", "/games/stake-export"],
    ] as const)("opens an available %s registry entry through the public Project workspace action", async (type, name, location) => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            "/api/home/projects/registry": () => ({
                ok: true,
                status: 200,
                body: [{location, name, type, capabilities: [], origin: "external", lastOpenedAt: "2026-01-01T00:00:00.000Z", status: "ok"}],
            }),
            "/api/home/projects/open": () => ({
                ok: true,
                status: 200,
                body: {context: {mode: "project", projectRoot: location}},
            }),
        });
        renderWithProviders(<ProjectsPanel />, {fetchImpl});

        const row = (await screen.findAllByText(name))
            .map((element) => element.closest("tr"))
            .find((candidate): candidate is HTMLTableRowElement => candidate !== null) as HTMLElement;
        expect(within(row).getByRole("button", {name: "Open"})).toBeInTheDocument();
        await user.click(within(row).getByRole("button", {name: "Open"}));

        await waitFor(() =>
            expect(calls).toContainEqual(
                expect.objectContaining({
                    url: "/api/home/projects/open",
                    init: expect.objectContaining({body: JSON.stringify({projectRoot: location})}),
                }),
            ),
        );
    });

    it("opens an available PAR workbook into its dashboard Build/Export card", async () => {
        const user = userEvent.setup();
        const location = "/games/sheet.xlsx";
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            ...AUTOMATIC_VALIDATION_ROUTE,
            "/api/home/projects/registry": () => ({
                ok: true,
                status: 200,
                body: [{location, name: "PAR sheet", type: "parWorkbook", capabilities: ["parWorkbook.exchange"], origin: "external", lastOpenedAt: "2026-01-01T00:00:00.000Z", status: "ok"}],
            }),
            "/api/home/projects/open": () => ({
                ok: true,
                status: 200,
                body: {context: {mode: "project", projectRoot: location}},
            }),
            "/api/project/context": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "artifact",
                    projectRoot: location,
                    project: {type: "parWorkbook", rootPath: location, capabilities: ["parWorkbook.exchange"], provenance: "registered workbook"},
                },
            }),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: location, valid: true, generated: false}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
            "/api/project/artifacts/targets": () => ({
                ok: true,
                status: 200,
                body: [
                    {target: "tsPackage", supported: false, state: "diagnostic-required", diagnostic: "A TypeScript package requires a Blueprint.", unsupportedNotes: []},
                    {target: "outcomeLibrary", supported: false, state: "diagnostic-required", diagnostic: "An Outcome library requires a runtime source.", unsupportedNotes: []},
                    {target: "stakeAdapter", supported: false, state: "diagnostic-required", diagnostic: "A Stake export requires an Outcome library.", unsupportedNotes: []},
                    {target: "parWorkbook", supported: true, state: "supported", unsupportedNotes: []},
                ],
            }),
            "/api/project/artifacts/preview": () => ({
                ok: true,
                status: 200,
                body: {
                    status: "ok",
                    target: "parWorkbook",
                    destination: "/games/republished-sheet.xlsx",
                    destinationKind: "file",
                    plannedOutputs: ["PAR workbook (.xlsx) file"],
                    sourceType: "parWorkbook",
                },
            }),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await goToProjects(user);

        const row = (await screen.findAllByText("PAR sheet"))
            .map((element) => element.closest("tr"))
            .find((candidate): candidate is HTMLTableRowElement => candidate !== null) as HTMLElement;
        await user.click(within(row).getByRole("button", {name: "Open"}));

        await waitFor(() =>
            expect(calls).toContainEqual(
                expect.objectContaining({
                    url: "/api/home/projects/open",
                    init: expect.objectContaining({body: JSON.stringify({projectRoot: location})}),
                }),
            ),
        );
        expect(await screen.findByRole("heading", {name: "PAR spreadsheet"})).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Build/Export"}));

        const buildArtifactSection = (await screen.findByText("Build artifact")).closest("fieldset") as HTMLElement;
        expect(await within(buildArtifactSection).findByText("PAR sheet (.xlsx)")).toBeInTheDocument();
        expect(within(buildArtifactSection).getByText(/republished-sheet\.xlsx/)).toBeInTheDocument();
        expect(within(buildArtifactSection).getByRole("button", {name: "Build"})).toBeEnabled();
        expect(screen.queryByText(/WASM/)).not.toBeInTheDocument();
    });

    it("disables every Open during a keyboard submission and restores the same control after failure for a single retry", async () => {
        const user = userEvent.setup();
        const location = "/games/Bounded reel editor.json";
        const resolvedRoot = "/games/generated runtime";
        let failOpen = true;
        let finishOpen: (() => void) | undefined;
        const routed = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: [
                {location, name: "Imported design", type: "blueprint", capabilities: [], origin: "external", lastOpenedAt: "2026-01-01T00:00:00.000Z", status: "ok"},
                {location: "/games/other", name: "Other game", type: "tsPackage", capabilities: [], origin: "external", lastOpenedAt: "2026-01-01T00:00:00.000Z", status: "ok"},
            ]}),
            "/api/home/projects/open": () => failOpen
                ? {ok: false, status: 500, body: {error: "Materialization failed"}}
                : {ok: true, status: 200, body: {context: {mode: "project", projectRoot: resolvedRoot}}},
        });
        const submissions: string[] = [];
        const fetchImpl: typeof routed.fetchImpl = (url, init) => {
            if (url !== "/api/home/projects/open") return routed.fetchImpl(url, init);
            submissions.push(init?.body ?? "");
            return new Promise((resolve) => {
                finishOpen = () => resolve(routed.fetchImpl(url, init));
            });
        };
        renderWithProviders(<><ProjectsPanel /><LocationProbe /></>, {fetchImpl, initialEntries: ["/home/projects"]});
        await screen.findByText("Imported design");
        const open = document.getElementById(`project-open:${location}`) as HTMLButtonElement;
        open.focus();
        await user.keyboard("[Space]");
        await waitFor(() => expect(open).toBeDisabled());
        expect(document.getElementById("project-open:/games/other")).toBeDisabled();
        await user.keyboard("[Space]");
        await user.click(screen.getAllByRole("button", {name: "Open"})[1]);
        expect(submissions).toEqual([JSON.stringify({projectRoot: location})]);
        await act(async () => {
            finishOpen?.();
            await Promise.resolve();
        });
        expect(await screen.findByRole("alert")).toHaveTextContent("The game design could not be completed. Try again. If it continues, choose the location again and retry.");
        await waitFor(() => expect(open).toBeEnabled());
        expect(document.getElementById(`project-open:${location}`)).toBe(open);
        expect(document.getElementById("project-open:/games/other")).toBeEnabled();
        expect(JSON.parse(screen.getByTestId("location").textContent ?? "{}").pathname).toBe("/home/projects");
        failOpen = false;
        open.focus();
        await user.keyboard("[Space]");
        await act(async () => {
            finishOpen?.();
            await Promise.resolve();
        });
        await waitFor(() => expect(JSON.parse(screen.getByTestId("location").textContent ?? "{}").pathname)
            .toBe(`/project/${encodeURIComponent(resolvedRoot)}/overview`));
        expect(submissions).toEqual([JSON.stringify({projectRoot: location}), JSON.stringify({projectRoot: location})]);
    });

    it("guards keyboard Open before its request, preserves the draft on Stay, then opens once after Leave", async () => {
        const user = userEvent.setup();
        const location = "/games/Imported keyboard design.json";
        const resolvedRoot = "/games/keyboard runtime";
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            ...AUTOMATIC_VALIDATION_ROUTE,
            "/api/home/projects/registry": () => ({ok: true, status: 200, body: [
                {location, name: "Imported design", type: "blueprint", capabilities: [], origin: "external", lastOpenedAt: "2026-01-01T00:00:00.000Z", status: "ok"},
            ]}),
            "/api/home/projects/open": () => ({ok: true, status: 200, body: {context: {mode: "project", projectRoot: resolvedRoot}}}),
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: resolvedRoot, game: {id: "keyboard", name: "Keyboard game", version: "0.1.0"}}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: resolvedRoot, valid: true}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        });
        const {router} = renderRoutedApp({fetchImpl, initialEntries: ["/home/design"]});
        await user.click(screen.getByRole("tab", {name: "Symbols"}));
        const symbols = within(screen.getByRole("tabpanel"));
        fireEvent.change(symbols.getByLabelText("New symbol id"), {target: {value: "keyboard-draft"}});
        await user.click(symbols.getByRole("button", {name: "Add symbol"}));
        await goToProjects(user);
        const open = await screen.findByRole("button", {name: "Open"});
        open.focus();
        await user.keyboard("[Space]");
        const dialog = await screen.findByRole("dialog");
        expect(open).toBeDisabled();
        expect(calls.filter((call) => call.url === "/api/home/projects/open")).toHaveLength(0);
        const stay = within(dialog).getByRole("button", {name: "Stay"});
        stay.focus();
        await user.keyboard("[Space]");
        await waitFor(() => expect(open).toBeEnabled());
        expect(document.getElementById(`project-open:${location}`)).toBe(open);
        expect(router.state.location.pathname).toBe("/home/projects");
        expect(calls.filter((call) => call.url === "/api/home/projects/open")).toHaveLength(0);
        const startGame = within(screen.getByRole("navigation", {name: "Sections"})).getByRole("button", {name: "Start a game"});
        await user.click(startGame);
        await waitFor(() => expect(startGame).toHaveAttribute("aria-current", "page"));
        expect(within(screen.getByRole("tabpanel")).getByDisplayValue("keyboard-draft")).toBeVisible();
        await goToProjects(user);
        await waitFor(() => expect(router.state.location.pathname).toBe("/home/projects"));
        open.focus();
        await user.keyboard("[Space]");
        const leave = within(await screen.findByRole("dialog")).getByRole("button", {name: "Leave"});
        leave.focus();
        await user.keyboard("[Space]");
        await waitFor(() => expect(router.state.location.pathname).toBe(`/project/${encodeURIComponent(resolvedRoot)}/overview`));
        expect(await screen.findByRole("heading", {name: "Keyboard game"})).toBeInTheDocument();
        expect(calls.filter((call) => call.url === "/api/home/projects/open")).toEqual([
            expect.objectContaining({init: expect.objectContaining({body: JSON.stringify({projectRoot: location})})}),
        ]);
    });

    it("uses the labelled card layout while desktop navigation leaves the Projects panel too narrow for every action", () => {
        const stylesheet = readFileSync(join(__dirname, "../../../../../../cli/studio-client/src/global.css"), "utf8");

        // At the 1050px audit viewport, AppShell's persistent navigation leaves about 790px for the
        // panel. Keep the Open button in its labelled card rather than clipping the sixth table column.
        expect(stylesheet).toMatch(/@media \(max-width: 75em\)[\s\S]*?\.project-registry-entry > td \{[\s\S]*?display: grid;/);
        expect(stylesheet).toMatch(/\.project-registry-entry > td \{[\s\S]*?min-width: 0;/);
        expect(stylesheet).toMatch(/@media \(max-width: 48em\)[\s\S]*?\.project-registry-entry > td,[\s\S]*?grid-template-columns: minmax\(0, 1fr\);/);
    });

    it("removes selected missing registrations together after confirmation", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
            ...AUTOMATIC_VALIDATION_ROUTE,
            "/api/home/projects/registry": () => ({
                ok: true,
                status: 200,
                body: [
                    {location: "/games/missing-a", name: "Missing A", type: "tsPackage", capabilities: [], origin: "external", lastOpenedAt: "2026-01-01T00:00:00.000Z", status: "missing"},
                    {location: "/games/missing-b", name: "Missing B", type: "blueprint", capabilities: [], origin: "managed", lastOpenedAt: "2026-01-01T00:00:00.000Z", status: "missing"},
                    {location: "/games/current", name: "Current", type: "tsPackage", capabilities: [], origin: "managed", lastOpenedAt: "2026-01-01T00:00:00.000Z", status: "ok"},
                ],
            }),
            "/api/home/projects/registry/remove": () => ({ok: true, status: 200, body: {status: "ok"}}),
        });
        renderRoutedApp({fetchImpl, initialEntries: ["/home/projects"]});

        await screen.findByText("Missing A (missing)");
        await user.click(screen.getByRole("checkbox", {name: "Select missing projects on this page"}));
        await user.click(screen.getByRole("button", {name: "Remove selected missing (2)"}));
        expect(await screen.findByText("Remove 2 missing projects from Projects? This only forgets them here -- nothing on disk is deleted.")).toBeInTheDocument();
        await user.click(screen.getByRole("button", {name: "Confirm"}));

        await waitFor(() => expect(calls.filter((call) => call.url === "/api/home/projects/registry/remove")).toHaveLength(2));
        expect(await screen.findByText("Current")).toBeInTheDocument();
        expect(screen.queryByText("Missing A (missing)")).not.toBeInTheDocument();
        expect(screen.queryByText("Missing B (missing)")).not.toBeInTheDocument();
    });
});

function removalFocusRoutes() {
    return createRoutedFakeFetch({
        "/api/context": () => ({ok: true, status: 200, body: {mode: "home"}}),
        "/api/home/jobs": () => ({ok: true, status: 200, body: {jobs: []}}),
        "/api/home/projects/registry": () => ({ok: true, status: 200, body: [
            {
                location: "/home/stager/Work/sta-ger/agents/runtime/verifier-hrnesses/V2C-35-7b16e5934c65e89d/fixtures/stale-packae",
                name: "Graceful Serene Frontier", type: "tsPackage", capabilities: [], origin: "external", status: "ok",
            },
            {location: "/games/sibling", name: "Sibling", type: "tsPackage", capabilities: [], origin: "external", status: "ok"},
        ]}),
        "/api/home/projects/registry/remove": () => ({ok: true, status: 200, body: {status: "ok"}}),
    });
}

async function resizeProjects(beforeFrame?: () => void): Promise<void> {
    await act(async () => {
        window.dispatchEvent(new Event("resize"));
        beforeFrame?.();
        await new Promise(resolve => {
            requestAnimationFrame(resolve);
        });
    });
}

// Home keeps Projects mounted while hidden. Exercise that same public prop
// lifecycle without launching the controller-owned Home navigation workflow.
function ProjectsFocusHarness() {
    const [visible, setVisible] = useState(true);
    return <>
        <button onClick={() => setVisible(value => !value)}>{visible ? "Hide projects" : "Show projects"}</button>
        <div style={{display: visible ? undefined : "none"}}><ProjectsPanel isVisible={visible} /></div>
    </>;
}

describe("V35 Home project removal focus", () => {
    it("V35-HOME-REMOVE-FOCUS-RESIZE keeps the cancelled launcher's visibility through reflow and delayed layout", async () => {
        const user = userEvent.setup();
        const layout = jobFocusLayout();
        const width = jest.replaceProperty(window, "innerWidth", 1439);
        const height = jest.replaceProperty(window, "innerHeight", 956);
        const {fetchImpl, calls} = removalFocusRoutes();
        const rendered = renderWithProviders(<ProjectsFocusHarness />, {fetchImpl});
        let bounds: jest.SpyInstance | undefined;
        try {
            const remove = (await screen.findAllByRole("button", {name: "Remove"}))[0];
            const region = remove.closest(".studio-projects")!;
            let x = 1294.125;
            let y = 463.03125;
            // Exact retained observation 155/158 rectangles. Only visibility
            // dispatch is simulated here; installed Chromium owns actual layout.
            bounds = jest.spyOn(remove, "getBoundingClientRect").mockImplementation(() => ({
                x, y, left: x, top: y, right: x + 84.09375, bottom: y + 30,
                width: 84.09375, height: 30, toJSON: () => ({}),
            }));
            await act(() => remove.focus());
            await user.keyboard("[Space]");
            const dialog = await screen.findByRole("dialog");
            expect(dialog).toHaveTextContent('Remove "Graceful Serene Frontier" from Projects?');
            await act(() => within(dialog).getByRole("button", {name: "Cancel"}).focus());
            await user.keyboard("[Space]");
            await waitFor(() => expect(remove).toHaveFocus());
            await resizeProjects();
            expect(layout.scroll).not.toHaveBeenCalled();
            expect(layout.observing(region)).toBe(true);

            width.replaceValue(800);
            height.replaceValue(650);
            x = 524.171875;
            y = 891.75;
            await resizeProjects();
            expect(remove).toHaveFocus();
            expect(layout.scroll).toHaveBeenCalledTimes(1);
            expect(layout.scroll.mock.instances[0]).toBe(remove);
            expect(layout.scroll).toHaveBeenLastCalledWith({block: "nearest", inline: "nearest", behavior: "instant"});

            // Native scrolling has settled; another resize needs no correction.
            layout.scroll.mockClear();
            y = 200;
            await resizeProjects();
            expect(layout.scroll).not.toHaveBeenCalled();
            y = 891.75;
            await layout.expand(region.parentElement!);
            expect(layout.scroll.mock.instances).toEqual([remove]);

            layout.scroll.mockClear();
            y = 600;
            height.replaceValue(600);
            await resizeProjects();
            expect(layout.scroll.mock.instances).toEqual([remove]);

            // Reverse reflow can move the same control above the fixed header.
            layout.scroll.mockClear();
            x = 1294.125;
            y = -24;
            width.replaceValue(1439);
            height.replaceValue(956);
            await resizeProjects();
            expect(layout.scroll.mock.instances).toEqual([remove]);
            expect(remove).toHaveFocus();
            expect(calls.filter(call => call.url.endsWith("/registry/remove"))).toEqual([]);
        } finally {
            rendered.unmount();
            bounds?.mockRestore();
            width.restore();
            height.restore();
            layout.restore();
        }
    });

    it("V35-HOME-REMOVE-FOCUS-OWNERSHIP rechecks sibling and dialog ownership and releases hidden or unmounted Projects", async () => {
        const user = userEvent.setup();
        const layout = jobFocusLayout();
        const {fetchImpl, calls} = removalFocusRoutes();
        const rendered = renderWithProviders(<ProjectsFocusHarness />, {fetchImpl});
        let bounds: jest.SpyInstance | undefined;
        let siblingBounds: jest.SpyInstance | undefined;
        try {
            const [remove, sibling] = await screen.findAllByRole("button", {name: "Remove"});
            const region = remove.closest(".studio-projects")!;
            let y = 200;
            bounds = jest.spyOn(remove, "getBoundingClientRect").mockImplementation(() => ({
                x: 524.171875, y, left: 524.171875, top: y, right: 608.265625, bottom: y + 30,
                width: 84.09375, height: 30, toJSON: () => ({}),
            }));
            siblingBounds = jest.spyOn(sibling, "getBoundingClientRect").mockReturnValue({
                x: 300, y: 200, left: 300, top: 200, right: 384, bottom: 230,
                width: 84, height: 30, toJSON: () => ({}),
            });
            await act(() => remove.focus());
            y = 891.75;
            await resizeProjects(() => sibling.focus());
            expect(sibling).toHaveFocus();
            expect(layout.scroll).not.toHaveBeenCalled();
            await user.keyboard("[Space]");
            const dialog = await screen.findByRole("dialog");
            expect(dialog).toHaveTextContent('Remove "Sibling" from Projects?');
            const cancel = within(dialog).getByRole("button", {name: "Cancel"});
            await act(() => cancel.focus());
            await layout.expand(region.parentElement!);
            expect(cancel).toHaveFocus();
            expect(layout.scroll).not.toHaveBeenCalled();
            await user.keyboard("[Space]");
            await waitFor(() => expect(sibling).toHaveFocus());

            // Ownership can change after an observer schedules its callback.
            y = 200;
            await act(() => remove.focus());
            y = 891.75;
            await layout.expand(region.parentElement!, () => sibling.focus());
            expect(sibling).toHaveFocus();
            expect(layout.scroll).not.toHaveBeenCalled();
            expect(calls.filter(call => call.url.endsWith("/registry/remove"))).toEqual([]);

            // Explicit confirmation still uses the chosen registry entry only.
            await user.keyboard("[Space]");
            const confirm = within(await screen.findByRole("dialog")).getByRole("button", {name: "Confirm"});
            await act(() => confirm.focus());
            await user.keyboard("[Space]");
            await waitFor(() => expect(sibling).not.toBeInTheDocument());
            expect(calls.filter(call => call.url.endsWith("/registry/remove")).map(call => JSON.parse(call.init!.body!)))
                .toEqual([{location: "/games/sibling"}]);

            const navigation = screen.getByRole("button", {name: "Hide projects"});
            await resizeProjects(() => navigation.focus());
            expect(navigation).toHaveFocus();
            expect(layout.scroll).not.toHaveBeenCalled();
            await user.keyboard("[Space]");
            await screen.findByRole("button", {name: "Show projects"});
            expect(layout.observing(region)).toBe(false);
            await resizeProjects();
            expect(layout.scroll).not.toHaveBeenCalled();

            await user.click(screen.getByRole("button", {name: "Show projects"}));
            await screen.findByRole("button", {name: "Hide projects"});
            expect(layout.observing(region)).toBe(true);
            y = 200;
            await act(() => remove.focus());
            y = 891.75;
            await layout.expand(region, () => rendered.unmount());
            expect(layout.observing(region)).toBe(false);
            expect(layout.scroll).not.toHaveBeenCalled();
        } finally {
            rendered.unmount();
            bounds?.mockRestore();
            siblingBounds?.mockRestore();
            layout.restore();
        }
    });

});


describe("V2C-36 projects-path-presentation", () => {
    // Exact locations from the retained populated Projects transcript / 1-observation.png,
    // run-2026-10-29T00-54-08-240Z. Keep this regression independent of external evidence files.
    const prefix = "/home/stager/Work/sta-ger/agents/runtime/verifier-harnesses/V2C-36-44b807505b46534f/run-2026-10-29T00-33-24-451Z/application-BRYW4Y/Documents/POKIE Projects";
    const available: StudioProjectRegistryView = {
        location: `${prefix}/royal-grand-stampede/blueprint.json`, name: "Royal Grand Stampede",
        type: "blueprint", capabilities: ["blueprint.build"], origin: "managed",
        lastOpenedAt: "2026-10-29T00:38:36.000Z", status: "ok",
    };
    const missing: StudioProjectRegistryView = {
        ...available, location: `${prefix}/starter-slot/blueprint.json`, name: "Starter Slot", status: "missing",
    };
    const registryRoute = {
        "/api/home/projects/registry": () => ({ok: true, status: 200, body: [available, missing]}),
    };

    it("keeps long absolute locations secondary and bounded, with full keyboard disclosure and path search", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch(registryRoute);
        renderWithProviders(<ProjectsPanel />, {fetchImpl});
        const name = await screen.findByRole("button", {name: available.name});
        const identity = name.closest(".project-registry-identity")!;
        const row = within(name.closest("tr")!);
        expect(identity).toHaveTextContent(available.name);
        expect(identity).toContainElement(row.getByText("Available"));
        const location = row.getByLabelText(`Project location: ${available.location}`);
        expect(location).toHaveTextContent(available.location);
        expect(location).toHaveClass("project-registry-location");
        expect(identity).toContainElement(location);
        expect(screen.getByRole("columnheader", {name: "Name"})).toHaveStyle({width: "30%"});
        expect(screen.getByRole("columnheader", {name: "Actions"})).toHaveStyle({width: "11rem"});
        expect(screen.getAllByRole("columnheader")[0]).toHaveStyle({width: "2.5rem"});
        expect(row.getByRole("button", {name: "Open"})).toBeEnabled();
        expect(row.getByRole("button", {name: "Remove"})).toBeEnabled();
        expect(row.queryByRole("button", {name: "Relocate"})).not.toBeInTheDocument();
        const missingRow = within(screen.getByText("Starter Slot (missing)").closest("tr")!);
        expect(missingRow.getByText("Needs attention")).toBeInTheDocument();
        expect(missingRow.getByRole("button", {name: "Relocate"})).toBeEnabled();
        expect(missingRow.getByRole("button", {name: "Remove"})).toBeEnabled();
        expect(missingRow.queryByRole("button", {name: "Open"})).not.toBeInTheDocument();

        await act(() => location.focus());
        expect(location).toHaveFocus();
        expect(await screen.findByRole("tooltip")).toHaveTextContent(available.location);
        await user.tab();
        await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
        await user.type(screen.getByLabelText("Search projects"), "application-BRYW4Y");
        expect(screen.getByText("Showing 1–2 of 2 projects")).toBeInTheDocument();
        await user.type(screen.getByLabelText("Search projects"), "/Documents/POKIE Projects/royal");
        expect(screen.getByText("Showing 1–1 of 1 projects")).toBeInTheDocument();
        expect(screen.queryByText("Starter Slot (missing)")).not.toBeInTheDocument();
        expect(screen.getByRole("button", {name: available.name})).toBeInTheDocument();

        // jsdom cannot prove rendered geometry; assert the real production CSS contract for both
        // table and 800px card layouts. Independent installed screenshots remain controller-owned.
        const stylesheet = readFileSync(join(__dirname, "../../../../../../cli/studio-client/src/global.css"), "utf8");
        const locationRule = stylesheet.match(/\.project-registry-location \{([^}]+)\}/)![1];
        for (const declaration of ["display: block;", "max-width: 100%;", "overflow: hidden;", "white-space: nowrap;", "text-overflow: ellipsis;"]) {
            expect(locationRule).toContain(declaration);
        }
        expect(stylesheet).toMatch(/\.project-registry-identity \{[^}]*min-width: 0;/);
        expect(stylesheet.match(/\.project-registry-location \{/g)).toHaveLength(1);
    });

    it("opens the full registered location and retains the compact row for retry after a failure", async () => {
        const user = userEvent.setup();
        let fail = true;
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...registryRoute,
            "/api/home/projects/open": () => fail
                ? {ok: false, status: 500, body: {error: "Materialization failed"}}
                : {ok: true, status: 200, body: {context: {mode: "project", projectRoot: "/games/runtime"}}},
        });
        renderWithProviders(<><ProjectsPanel /><LocationProbe /></>, {fetchImpl});
        const open = await screen.findByRole("button", {name: "Open"});
        await user.click(open);
        expect(await screen.findByRole("alert")).toHaveTextContent("The game design could not be completed. Try again. If it continues, choose the location again and retry.");
        await waitFor(() => expect(open).toBeEnabled());
        expect(screen.getByRole("button", {name: available.name})).toBeInTheDocument();
        fail = false;
        await user.click(open);
        await waitFor(() => expect(screen.getByTestId("location")).toHaveTextContent("/project/%2Fgames%2Fruntime/overview"));
        expect(calls.filter(call => call.url === "/api/home/projects/open").map(call => JSON.parse(call.init!.body!))).toEqual([
            {projectRoot: available.location}, {projectRoot: available.location},
        ]);
    });

    it("relocates and removes the full long-path entry with recovery and confirmation intact", async () => {
        const user = userEvent.setup();
        const newLocation = "/moved/starter-slot/blueprint.json";
        let recognized = false;
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...registryRoute,
            "/api/home/projects/registry/relocate": () => ({ok: true, status: 200, body: recognized
                ? {status: "ok", entry: {...missing, location: newLocation, status: "ok"}}
                : {status: "unrecognized", path: newLocation}}),
            "/api/home/projects/registry/remove": () => ({ok: true, status: 200, body: {status: "ok"}}),
        });
        renderWithProviders(<ProjectsPanel />, {fetchImpl});
        await user.click(await screen.findByRole("button", {name: "Relocate"}));
        fireEvent.change(screen.getByLabelText("New location"), {target: {value: newLocation}});
        await user.click(screen.getAllByRole("button", {name: "Relocate"})[1]);
        expect(await screen.findByText(`"${newLocation}" isn't a recognized game location. Choose another location or retry.`)).toBeInTheDocument();
        expect(screen.getByText("Starter Slot (missing)")).toBeInTheDocument();
        recognized = true;
        await user.click(screen.getAllByRole("button", {name: "Relocate"})[1]);
        const relocated = await screen.findByRole("button", {name: missing.name});
        const row = within(relocated.closest("tr")!);
        expect(row.getByLabelText(`Project location: ${newLocation}`)).toHaveClass("project-registry-location");
        expect(row.getByRole("button", {name: "Open"})).toBeEnabled();
        expect(screen.queryByText("Starter Slot (missing)")).not.toBeInTheDocument();
        expect(calls.filter(call => call.url.endsWith("/registry/relocate")).map(call => JSON.parse(call.init!.body!))).toEqual([
            {location: missing.location, newLocation}, {location: missing.location, newLocation},
        ]);
        const availableRow = within(screen.getByRole("button", {name: available.name}).closest("tr")!);
        await user.click(availableRow.getByRole("button", {name: "Remove"}));
        await user.click(await screen.findByRole("button", {name: "Cancel"}));
        expect(calls.filter(call => call.url.endsWith("/registry/remove"))).toHaveLength(0);
        expect(screen.getByRole("button", {name: available.name})).toBeInTheDocument();
        await user.click(availableRow.getByRole("button", {name: "Remove"}));
        await user.click(await screen.findByRole("button", {name: "Confirm"}));
        await waitFor(() => expect(screen.queryByRole("button", {name: available.name})).not.toBeInTheDocument());
        expect(screen.getByRole("button", {name: missing.name})).toBeInTheDocument();
        expect(calls.filter(call => call.url.endsWith("/registry/remove")).map(call => JSON.parse(call.init!.body!))).toEqual([{location: available.location}]);
    });
});
