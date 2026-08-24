/**
 * @jest-environment jsdom
 */

type ClientResponse = {
    ok: boolean;
    status: number;
    json(): Promise<unknown>;
};

type Deferred<T> = {
    promise: Promise<T>;
    resolve(value: T): void;
};

type SessionIntent = {
    label: string;
    sessionId: string;
    expectedUrl: string;
    expectedBody?: string;
    trigger(): void;
};

function deferred<T>(): Deferred<T> {
    let resolve: (value: T) => void = () => undefined;
    const promise = new Promise<T>((resolvePromise) => {
        resolve = resolvePromise;
    });
    return {promise, resolve};
}

function response(body: unknown): ClientResponse {
    return {ok: true, status: 200, json: () => Promise.resolve(body)};
}

function session(sessionId: string): object {
    return {
        sessionId,
        game: {id: "fixture", name: "Fixture", version: "1.0.0"},
        credits: 100,
    };
}

function createPlayerDom(): void {
    const inputIds = ["session-seed", "session-id"];
    const buttonIds = [
        "spin-button",
        "start-session-button",
        "restore-session-button",
        "connection-retry-button",
        "spin-retry-button",
        "spin-reconnect-button",
        "prev-stage",
        "next-stage",
    ];
    const elementIds = [
        "status",
        "game-title",
        "bet",
        "credits",
        "win",
        "payout-multiplier",
        "screen",
        "raw-json",
        "stages-section",
        "stage-label",
        "stage-screen",
        "stage-raw-json",
        "player-section",
        "player-grid-container",
        "player-bet-info",
        "player-mode-info",
        "player-features",
        "player-wins-section",
        "player-wins-list",
        "player-lines-list",
        "player-paytable-head",
        "player-paytable-body",
        "connection-error",
        "connection-error-message",
        "connection-error-detail",
        "spin-error",
        "spin-error-message",
        "spin-error-detail",
    ];

    document.body.innerHTML = "";
    [...inputIds, ...buttonIds, ...elementIds].forEach((id) => {
        let tag = "div";
        if (inputIds.includes(id)) {
            tag = "input";
        } else if (buttonIds.includes(id)) {
            tag = "button";
        }
        const element = document.createElement(tag);
        element.id = id;
        document.body.appendChild(element);
    });
}

async function flushPromises(): Promise<void> {
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
}

describe("Player session boot", () => {
    beforeEach(() => {
        jest.resetModules();
        window.localStorage.clear();
        createPlayerDom();
    });

    it.each<SessionIntent>([
        {
            label: "starts a seeded session",
            trigger: () => {
                (document.getElementById("session-seed") as HTMLInputElement).value = "fixture-round";
                (document.getElementById("start-session-button") as HTMLButtonElement).click();
            },
            sessionId: "seeded-session",
            expectedUrl: "http://api.test/sessions",
            expectedBody: JSON.stringify({seed: "fixture-round"}),
        },
        {
            label: "restores a session",
            trigger: () => {
                (document.getElementById("session-id") as HTMLInputElement).value = "restored-session";
                (document.getElementById("restore-session-button") as HTMLButtonElement).click();
            },
            sessionId: "restored-session",
            expectedUrl: "http://api.test/sessions/restored-session",
        },
    ])("keeps the newest intent when an initial session request resolves last ($label)", async (intent) => {
        const initialSession = deferred<ClientResponse>();
        const requests: Array<{url: string; init?: {method?: string; body?: string}}> = [];
        const fetchImpl = jest.fn((url: string, init?: {method?: string; body?: string}): Promise<ClientResponse> => {
            requests.push({url, init});
            if (url === "/config") {
                return Promise.resolve(response({apiBaseUrl: "http://api.test"}));
            }
            if (url === "http://api.test/sessions" && init?.body === undefined) {
                return initialSession.promise;
            }
            if (url === intent.expectedUrl) {
                return Promise.resolve(response(session(intent.sessionId)));
            }
            if (url === `http://api.test/sessions/${intent.sessionId}/spin`) {
                return Promise.resolve(response(session(intent.sessionId)));
            }
            throw new Error(`Unexpected request: ${url}`);
        });
        window.fetch = fetchImpl as unknown as typeof window.fetch;

        await import("../../../cli/client/main.js");
        await flushPromises();
        expect(requests).toContainEqual({url: "http://api.test/sessions", init: expect.objectContaining({method: "POST"})});

        intent.trigger();
        await flushPromises();
        initialSession.resolve(response(session("initial-session")));
        await flushPromises();

        expect(requests).toContainEqual({
            url: intent.expectedUrl,
            init: intent.expectedBody === undefined ? undefined : expect.objectContaining({body: intent.expectedBody}),
        });
        expect((document.getElementById("session-id") as HTMLInputElement).value).toBe(intent.sessionId);
        expect(document.getElementById("raw-json")?.textContent).toContain(intent.sessionId);
        expect(window.localStorage.getItem("pokie:sessionId")).toBe(intent.sessionId);

        const spinButton = document.getElementById("spin-button") as HTMLButtonElement;
        expect(spinButton.disabled).toBe(false);
        spinButton.click();
        await flushPromises();
        expect(requests).toContainEqual({
            url: `http://api.test/sessions/${intent.sessionId}/spin`,
            init: expect.objectContaining({method: "POST"}),
        });
    });
});
