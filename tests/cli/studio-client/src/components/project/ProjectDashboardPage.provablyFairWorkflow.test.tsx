import {screen} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type {FetchLike} from "../../../../../../cli/studio-client/src/api/apiClient";
import type {FairnessCommitment, FairnessRoundProof} from "../../../../../../cli/studio-client/src/api/types";
import {createRoutedFakeFetch, type FakeCall} from "../../testUtils/fakeFetch";
import {renderRoutedApp} from "../../testUtils/renderRoutedApp";

const GAME = {id: "a", name: "A", version: "1.0.0"};

const BASE_ROUTES: Record<string, (call: FakeCall) => {ok: boolean; status: number; body: unknown}> = {
    "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/a", game: GAME}}),
    "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/a", valid: true, generated: false}}),
    "/api/project/reports": () => ({ok: true, status: 200, body: []}),
    "/api/project/replays": () => ({ok: true, status: 200, body: []}),
    "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
    "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
};

function jsonResponse(body: unknown, status = 200) {
    return Promise.resolve({ok: status < 400, status, json: () => Promise.resolve(body)});
}

const SERVER_SEED_COMMITMENT = {schemaVersion: 1, algorithmVersion: "pokie-fairness-hmac-sha256-v1", serverSeedHash: "sha256:server-seed-hash", issuedAt: "2026-07-20T00:00:00.000Z"};

const COMMITMENT: FairnessCommitment = {
    schemaVersion: 1,
    algorithmVersion: "pokie-fairness-hmac-sha256-v1",
    serverSeedHash: "sha256:server-seed-hash",
    clientSeed: "player-client-seed",
    nonce: 0,
    libraryId: "lib-base",
    libraryHash: "sha256:lib-base",
    modeName: "base",
    issuedAt: "2026-07-20T00:00:00.000Z",
};

const PROOF: FairnessRoundProof = {
    schemaVersion: 1,
    algorithmVersion: "pokie-fairness-hmac-sha256-v1",
    serverSeed: "operator-server-seed",
    serverSeedHash: "sha256:server-seed-hash",
    clientSeed: "player-client-seed",
    nonce: 0,
    libraryId: "lib-base",
    libraryHash: "sha256:lib-base",
    modeName: "base",
    indexHash: "sha256:index-hash",
    outcomeId: "0007",
    weight: 3,
    recordHash: "sha256:record-hash",
    commitmentHash: "sha256:commitment-hash",
    revealedAt: "2026-07-20T00:01:00.000Z",
};

async function goToProvablyFairTab(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await screen.findByRole("heading", {name: "A"});
    await user.click(screen.getByRole("button", {name: "Provably Fair"}));
    await screen.findByLabelText("Source outcome-library bundle directory");
}

async function fillConfigureStep(user: ReturnType<typeof userEvent.setup>): Promise<void> {
    await user.type(screen.getByLabelText("Source outcome-library bundle directory"), "./bundle");
    await user.type(screen.getByLabelText("Mode name"), "base");
    await user.type(screen.getByLabelText("Server seed"), "operator-server-seed");
    await user.type(screen.getByLabelText("Client seed"), "player-client-seed");
    await user.click(screen.getByRole("button", {name: "Compute commitments"}));
    await screen.findByText("Server seed commitment (publish first)");
}

describe("ProjectDashboardPage - Provably Fair workflow", () => {
    it("runs the full Configure -> Generate -> Verify -> Review diagnostics workflow", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/fairness/configure": () => ({ok: true, status: 200, body: {status: "ok", serverSeedCommitment: SERVER_SEED_COMMITMENT, commitment: COMMITMENT}}),
            "/api/project/fairness/generate": () => ({ok: true, status: 200, body: {status: "ok", proof: PROOF}}),
            "/api/project/fairness/verify": () => ({ok: true, status: 200, body: {status: "ok", errors: [], warnings: []}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToProvablyFairTab(user);
        await fillConfigureStep(user);
        expect(screen.getByText("sha256:server-seed-hash")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Continue to Generate/inspect proof"}));
        await user.click(screen.getByRole("button", {name: "Generate round proof"}));
        expect(await screen.findByText("0007")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Continue to Verify"}));
        await user.click(screen.getByRole("button", {name: "Verify"}));
        expect(await screen.findByText("Verified")).toBeInTheDocument();

        await user.click(screen.getByRole("button", {name: "Continue to Review diagnostics"}));
        expect(await screen.findByText("Verified")).toBeInTheDocument();
    });

    it("verifies a pasted external proof/commitment directly, with no Configure/Generate for an unrelated round in this session", async () => {
        const user = userEvent.setup();
        const {fetchImpl, calls} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/fairness/configure": () => {
                throw new Error("Configure must never be called for a direct external verify.");
            },
            "/api/project/fairness/generate": () => {
                throw new Error("Generate must never be called for a direct external verify.");
            },
            "/api/project/fairness/verify": () => ({ok: true, status: 200, body: {status: "ok", errors: [], warnings: []}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToProvablyFairTab(user);

        // Jump straight to Verify -- the Stepper step itself must never be gated behind Configure, since
        // verifying someone else's already-published proof/commitment is the actual real-world Provably
        // Fair use case and has nothing to do with this session's own Configure/Generate.
        await user.click(screen.getByRole("button", {name: /Verify/}));
        await user.click(screen.getByText("Paste external proof/commitment"));

        await user.click(screen.getByLabelText("Proof JSON"));
        await user.paste(JSON.stringify(PROOF));
        await user.click(screen.getByLabelText("Commitment JSON"));
        await user.paste(JSON.stringify(COMMITMENT));
        await user.type(screen.getByLabelText("Source outcome-library bundle directory"), "./bundle");

        await user.click(screen.getByRole("button", {name: "Verify", exact: true}));

        expect(await screen.findByText("Verified")).toBeInTheDocument();
        expect(calls.some((call) => call.url === "/api/project/fairness/configure")).toBe(false);
        expect(calls.some((call) => call.url === "/api/project/fairness/generate")).toBe(false);
        const verifyCall = calls.find((call) => call.url === "/api/project/fairness/verify");
        expect(JSON.parse(verifyCall?.init?.body ?? "{}")).toEqual({proof: PROOF, commitment: COMMITMENT, sourceBundleDir: "./bundle"});
    });

    it("reports an invalid configuration for a domain-level rejection (e.g. an invalid seed/mode combination)", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/fairness/configure": () => ({ok: true, status: 200, body: {status: "invalid", message: "nonce must be a non-negative safe integer, got -1."}}),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToProvablyFairTab(user);
        await user.type(screen.getByLabelText("Source outcome-library bundle directory"), "./bundle");
        await user.type(screen.getByLabelText("Mode name"), "base");
        await user.type(screen.getByLabelText("Server seed"), "operator-server-seed");
        await user.type(screen.getByLabelText("Client seed"), "player-client-seed");

        await user.click(screen.getByRole("button", {name: "Compute commitments"}));

        expect(await screen.findByText(/nonce must be a non-negative safe integer/)).toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to Generate/inspect proof"})).not.toBeInTheDocument();
    });

    it("shows verify failure diagnostics for a tampered/pasted proof, never a thrown error", async () => {
        const user = userEvent.setup();
        const {fetchImpl} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/fairness/configure": () => ({ok: true, status: 200, body: {status: "ok", serverSeedCommitment: SERVER_SEED_COMMITMENT, commitment: COMMITMENT}}),
            "/api/project/fairness/generate": () => ({ok: true, status: 200, body: {status: "ok", proof: PROOF}}),
            "/api/project/fairness/verify": () => ({
                ok: true,
                status: 200,
                body: {status: "ok", errors: [{code: "fairness-verify-outcome-mismatch", severity: "error", message: "The proof's outcomeId does not match the live draw."}], warnings: []},
            }),
        });

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToProvablyFairTab(user);
        await fillConfigureStep(user);
        await user.click(screen.getByRole("button", {name: "Continue to Generate/inspect proof"}));
        await user.click(screen.getByRole("button", {name: "Generate round proof"}));
        await screen.findByText("0007");
        await user.click(screen.getByRole("button", {name: "Continue to Verify"}));

        // Switch to pasting an external (here: tampered) proof/commitment instead of the one just
        // generated in this session -- the actual real-world Provably Fair use case.
        await user.click(screen.getByText("Paste external proof/commitment"));
        await screen.findByLabelText("Proof JSON");
        await user.click(screen.getByLabelText("Proof JSON"));
        await user.paste(JSON.stringify({...PROOF, outcomeId: "9999"}));
        await user.click(screen.getByLabelText("Commitment JSON"));
        await user.paste(JSON.stringify(COMMITMENT));

        await user.click(screen.getByRole("button", {name: "Verify"}));

        expect(await screen.findByText("Did not verify")).toBeInTheDocument();
        expect(screen.getByText(/does not match the live draw/)).toBeInTheDocument();
    });

    it("ignores a late verify response once a newer one has already landed", async () => {
        const user = userEvent.setup();
        let resolveFirst: ((response: {ok: boolean; status: number; json(): Promise<unknown>}) => void) | undefined;
        let callCount = 0;
        const fetchImpl: FetchLike = (url, init) => {
            if (url in BASE_ROUTES) {
                const routed = BASE_ROUTES[url]({url, init});
                return jsonResponse(routed.body, routed.status);
            }
            if (url === "/api/project/fairness/configure") {
                return jsonResponse({status: "ok", serverSeedCommitment: SERVER_SEED_COMMITMENT, commitment: COMMITMENT});
            }
            if (url === "/api/project/fairness/generate") {
                return jsonResponse({status: "ok", proof: PROOF});
            }
            if (url === "/api/project/fairness/verify") {
                callCount += 1;
                if (callCount === 1) {
                    return new Promise((res) => {
                        resolveFirst = res;
                    });
                }
                return jsonResponse({
                    status: "ok",
                    errors: [{code: "second-response-error", severity: "error", message: "The second, faster response."}],
                    warnings: [],
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToProvablyFairTab(user);
        await fillConfigureStep(user);
        await user.click(screen.getByRole("button", {name: "Continue to Generate/inspect proof"}));
        await user.click(screen.getByRole("button", {name: "Generate round proof"}));
        await screen.findByText("0007");
        await user.click(screen.getByRole("button", {name: "Continue to Verify"}));

        await user.click(screen.getByRole("button", {name: "Verify"}));
        // Editing the bundle directory while the first verify is still in flight invalidates it and
        // frees the guard right away.
        await user.type(screen.getByLabelText("Source outcome-library bundle directory"), "-changed");
        await user.click(screen.getByRole("button", {name: "Verify"}));

        expect(await screen.findByText(/The second, faster response\./)).toBeInTheDocument();

        resolveFirst?.(await jsonResponse({status: "ok", errors: [], warnings: []}));
        await new Promise((resolveTimeout) => {
            setTimeout(resolveTimeout, 50);
        });

        expect(screen.getByText(/The second, faster response\./)).toBeInTheDocument();
    });

    it("does not send a second verify request while the first is still in flight (double-submit guard)", async () => {
        const user = userEvent.setup();
        let resolveVerify: ((response: {ok: boolean; status: number; json(): Promise<unknown>}) => void) | undefined;
        const callList: FakeCall[] = [];
        const fetchImpl: FetchLike = (url, init) => {
            callList.push({url, init});
            if (url in BASE_ROUTES) {
                const routed = BASE_ROUTES[url]({url, init});
                return jsonResponse(routed.body, routed.status);
            }
            if (url === "/api/project/fairness/configure") {
                return jsonResponse({status: "ok", serverSeedCommitment: SERVER_SEED_COMMITMENT, commitment: COMMITMENT});
            }
            if (url === "/api/project/fairness/generate") {
                return jsonResponse({status: "ok", proof: PROOF});
            }
            if (url === "/api/project/fairness/verify") {
                return new Promise((res) => {
                    resolveVerify = res;
                });
            }
            return Promise.reject(new Error(`unexpected fetch ${url}`));
        };

        renderRoutedApp({fetchImpl, initialEntries: ["/project/overview"]});
        await goToProvablyFairTab(user);
        await fillConfigureStep(user);
        await user.click(screen.getByRole("button", {name: "Continue to Generate/inspect proof"}));
        await user.click(screen.getByRole("button", {name: "Generate round proof"}));
        await screen.findByText("0007");
        await user.click(screen.getByRole("button", {name: "Continue to Verify"}));

        const verifyButton = screen.getByRole("button", {name: "Verify"});
        await user.click(verifyButton);
        await user.click(verifyButton);
        await user.click(verifyButton);

        expect(callList.filter((call) => call.url === "/api/project/fairness/verify")).toHaveLength(1);

        resolveVerify?.(await jsonResponse({status: "ok", errors: [], warnings: []}));
    });

    it("clears all Provably Fair state when the project switches", async () => {
        const user = userEvent.setup();
        const {fetchImpl: fetchImplA} = createRoutedFakeFetch({
            ...BASE_ROUTES,
            "/api/project/fairness/configure": () => ({ok: true, status: 200, body: {status: "ok", serverSeedCommitment: SERVER_SEED_COMMITMENT, commitment: COMMITMENT}}),
        });

        const first = renderRoutedApp({fetchImpl: fetchImplA, initialEntries: ["/project/overview"]});
        await goToProvablyFairTab(user);
        await fillConfigureStep(user);
        expect(screen.getByText("sha256:server-seed-hash")).toBeInTheDocument();

        first.unmount();

        const {fetchImpl: fetchImplB} = createRoutedFakeFetch({
            "/api/project/context": () => ({ok: true, status: 200, body: {status: "loaded", projectRoot: "/games/b", game: {id: "b", name: "B", version: "1.0.0"}}}),
            "/api/project/inspect": () => ({ok: true, status: 200, body: {packageRoot: "/games/b", valid: true, generated: false}}),
            "/api/project/reports": () => ({ok: true, status: 200, body: []}),
            "/api/project/replays": () => ({ok: true, status: 200, body: []}),
            "/api/project/runtime": () => ({ok: true, status: 200, body: {status: "stopped"}}),
            "/api/project/deployment/targets": () => ({ok: true, status: 200, body: []}),
        });
        renderRoutedApp({fetchImpl: fetchImplB, initialEntries: ["/project/overview"]});
        await screen.findByRole("heading", {name: "B"});
        await user.click(screen.getByRole("button", {name: "Provably Fair"}));

        expect(await screen.findByLabelText("Source outcome-library bundle directory")).toHaveValue("");
        expect(screen.queryByText("sha256:server-seed-hash")).not.toBeInTheDocument();
        expect(screen.queryByRole("button", {name: "Continue to Generate/inspect proof"})).not.toBeInTheDocument();
    });
});
