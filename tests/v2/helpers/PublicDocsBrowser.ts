import {spawn, type ChildProcess} from "node:child_process";
import fs from "node:fs";
import type {Readable, Writable} from "node:stream";

type PendingCommand = {
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
    timer: ReturnType<typeof setTimeout>;
};

/** Small owned CDP-pipe transport; all site-specific assertions stay in PublicDocsSite. */
export class PublicDocsBrowser {
    private readonly process: ChildProcess;
    private readonly closed: Promise<void>;
    private closing?: Promise<void>;
    private readonly pending = new Map<number, PendingCommand>();
    private buffer = "";
    private sequence = 0;
    private stderr = "";
    private session?: string;

    constructor(profile: string, localOnly = false) {
        const executable = [
            process.env.CHROMIUM_PATH,
            "/usr/bin/chromium",
            "/usr/bin/chromium-browser",
            "/snap/bin/chromium",
            "/usr/bin/google-chrome",
        ].find((file) => file && fs.existsSync(file));
        if (!executable) {
            throw new Error(
                "Real Chromium is required. Set CHROMIUM_PATH; browser verification is unverified, not skipped.",
            );
        }
        this.process = spawn(
            executable,
            [
                "--headless",
                ...(localOnly ? ["--proxy-server=http://127.0.0.1:9", "--proxy-bypass-list=127.0.0.1;localhost"] : []),
                "--no-sandbox",
                "--disable-gpu",
                "--disable-dev-shm-usage",
                "--no-first-run",
                "--no-default-browser-check",
                `--user-data-dir=${profile}`,
                "--remote-debugging-pipe",
            ],
            {stdio: ["ignore", "ignore", "pipe", "pipe", "pipe"]},
        );
        this.closed = new Promise((resolve) => {
            this.process.once("close", () => resolve());
        });
        this.process.stderr?.on("data", (chunk) => {
            this.stderr = (this.stderr + chunk).slice(-4000);
        });
        (this.process.stdio[4] as Readable).on("data", (chunk) => {
            this.buffer += chunk.toString();
            let boundary: number;
            while ((boundary = this.buffer.indexOf("\0")) >= 0) {
                const message = JSON.parse(this.buffer.slice(0, boundary));
                this.buffer = this.buffer.slice(boundary + 1);
                const pending = this.pending.get(message.id);
                if (!pending) continue;
                clearTimeout(pending.timer);
                this.pending.delete(message.id);
                if (message.error) pending.reject(new Error(message.error.message));
                else pending.resolve(message.result);
            }
        });
        const rejectAll = (error: Error): void => {
            for (const pending of this.pending.values()) {
                clearTimeout(pending.timer);
                pending.reject(error);
            }
            this.pending.clear();
        };
        this.process.on("error", (error) => rejectAll(error));
        this.process.on("exit", () => rejectAll(new Error(`Chromium exited: ${this.stderr}`)));
    }

    public async start(): Promise<void> {
        await this.send("Browser.getVersion", {}, false);
        const target = await this.send<{targetId: string}>("Target.createTarget", {url: "about:blank"}, false);
        const attached = await this.send<{sessionId: string}>(
            "Target.attachToTarget",
            {targetId: target.targetId, flatten: true},
            false,
        );
        this.session = attached.sessionId;
        await this.send("Page.enable");
        await this.send("Runtime.enable");
    }

    public send<T = Record<string, unknown>>(
        method: string,
        params: Record<string, unknown> = {},
        session = true,
    ): Promise<T> {
        return new Promise((resolve, reject) => {
            const id = ++this.sequence;
            const timer = setTimeout(() => {
                this.pending.delete(id);
                reject(new Error(`CDP timeout ${method}: ${this.stderr}`));
            }, 10000);
            this.pending.set(id, {resolve: (value) => resolve(value as T), reject, timer});
            (this.process.stdio[3] as Writable).write(
                `${JSON.stringify({
                    id,
                    method,
                    params,
                    ...(session && this.session ? {sessionId: this.session} : {}),
                })}\0`,
            );
        });
    }

    public async evaluate<T>(expression: string): Promise<T> {
        const response = await this.send<{result: {value: T}; exceptionDetails?: unknown}>("Runtime.evaluate", {
            expression,
            awaitPromise: true,
            returnByValue: true,
        });
        if (response.exceptionDetails) {
            throw new Error(`Browser evaluation failed: ${JSON.stringify(response.exceptionDetails)}`);
        }
        return response.result.value;
    }

    public async until(expression: string): Promise<void> {
        const deadline = Date.now() + 10000;
        while (Date.now() < deadline) {
            if (await this.evaluate<boolean>(expression)) return;
            await new Promise((resolve) => {
                setTimeout(resolve, 40);
            });
        }
        throw new Error(`Browser condition timed out: ${expression}`);
    }

    public async navigate(url: string): Promise<void> {
        await this.send("Page.navigate", {url});
        await this.until(
            `location.href === ${JSON.stringify(
                url,
            )} && document.readyState === 'complete' && !!document.querySelector('#docs-search')`,
        );
    }

    public async key(key: string, code = key, virtualKey = 0): Promise<void> {
        await this.send("Input.dispatchKeyEvent", {type: "keyDown", key, code, windowsVirtualKeyCode: virtualKey});
        await this.send("Input.dispatchKeyEvent", {type: "keyUp", key, code, windowsVirtualKeyCode: virtualKey});
    }

    public close(): Promise<void> {
        this.closing ??= this.closeBrowser();
        return this.closing;
    }

    private async closeBrowser(): Promise<void> {
        for (const pending of this.pending.values()) {
            clearTimeout(pending.timer);
            pending.reject(new Error("Browser closing"));
        }
        this.pending.clear();
        if (this.process.exitCode !== null || this.process.signalCode !== null) {
            await this.closed;
            return;
        }
        const timer = setTimeout(() => this.process.kill("SIGKILL"), 3000);
        try {
            // Let Chromium flush its profile and stop its children before deleting
            // their files. Parent exit alone does not drain inherited stdio.
            const shutdown = this.send("Browser.close", {}, false).catch(() => {
                this.process.kill("SIGTERM");
            });
            await this.closed;
            await shutdown;
        } finally {
            clearTimeout(timer);
        }
    }
}
