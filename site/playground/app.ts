import {renderGallery, renderPlayground} from "./view.js";
import {galleryModels, galleryPolicy} from "./models.js";
import {PlaygroundController, type PlaygroundDraft, type PlaygroundEvent} from "./controller.js";
import {
    SimulationReportBuilder,
    POKIE_WASM_SIMULATION_CREDITS,
    type PokieWasmRound,
    type PokieWasmWorkerPort,
} from "../../src/wasm/browser.js";
import type {GameBlueprint} from "../../src/generated/GameBlueprint.js";
import type {SimulationStatistics} from "../../src/simulation/SimulationStatistics.js";
import {ScreenProjection} from "../../src/session/videoslot/coordinates/ScreenProjection.js";

const siteBase = new URL(/* @vite-ignore */ "../../", import.meta.url).pathname;
const gallery = document.querySelector<HTMLElement>("#gallery");
if (gallery) gallery.innerHTML = renderGallery(siteBase);
const host = document.querySelector<HTMLElement>("#playground");
if (host) mount(host);

function mount(root: HTMLElement): void {
    root.innerHTML = renderPlayground(siteBase, true);
    const element = <T extends HTMLElement>(id: string): T => root.querySelector<T>(`#pg-${id}`)!;
    const model = element<HTMLTextAreaElement>("model"),
        policy = element<HTMLTextAreaElement>("policy"),
        select = element<HTMLSelectElement>("example");
    let lastValid: PlaygroundDraft | undefined;
    let displayed: Awaited<ReturnType<PlaygroundController["run"]>> | undefined;
    let candidate: GameBlueprint | undefined;
    let reports: unknown;
    let uiGeneration = 0;
    const controller = new PlaygroundController(
        () => new Worker(`${siteBase}assets/playground/worker.js`, {type: "module", name: "POKIE public playground"}) as PokieWasmWorkerPort,
        update,
    );
    function update(event: PlaygroundEvent): void {
        const status = element("status");
        status.textContent = event.message;
        status.dataset.status = event.status;
        const busy = ["validating", "running"].includes(event.status);
        root.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) => {
            button.disabled = busy;
        });
        element<HTMLButtonElement>("cancel").disabled = !busy;
        for (const id of ["apply", "discard"]) element<HTMLButtonElement>(id).disabled = busy || !candidate;
        const progress = element<HTMLProgressElement>("progress");
        progress.hidden = !busy;
        progress.max = event.progress?.total ?? 1;
        progress.value = event.progress?.completed ?? 0;
    }
    function clear(retainReview = false): void {
        uiGeneration++;
        displayed = undefined;
        if (!retainReview) candidate = undefined;
        reports = undefined;
        element("identity").textContent = "Inputs changed. Run again to bind a current identity.";
        element("output").textContent = "No current output.";
        element("preview").textContent = candidate
            ? "Stale preview: inputs changed. Apply will reject this review; generate a new preview or discard it."
            : "No current candidate.";
        element("summary").textContent = "No current result. Run again with the current inputs.";
        element("download-status").textContent = "";
        element("screen").replaceChildren();
        element("download-buttons").replaceChildren();
        for (const id of ["apply", "discard"]) element<HTMLButtonElement>(id).disabled = !candidate;
        element<HTMLButtonElement>("replay-play").disabled = true;
    }
    function draft(): PlaygroundDraft {
        if (model.value.length > 65536) throw new Error("Blueprint exceeds 64 KiB limit.");
        return {
            blueprint: JSON.parse(model.value),
            settings: {
                seed: element<HTMLInputElement>("seed").value,
                bet: Number(element<HTMLInputElement>("bet").value),
                mode: element<HTMLInputElement>("mode").value || undefined,
                rounds: Number(element<HTMLInputElement>("rounds").value),
            },
        };
    }
    function replace(id: string, updateUrl = true): void {
        controller.invalidate();
        clear();
        const item = galleryModels.find((i) => i.id === id) ?? galleryModels[0];
        select.value = item.id;
        element<HTMLInputElement>("seed").value = "gallery-29";
        element<HTMLInputElement>("bet").value = "0.05";
        element<HTMLInputElement>("rounds").value = "256";
        model.value = JSON.stringify(item.blueprint, null, 2);
        element<HTMLInputElement>("mode").value = "";
        policy.value = JSON.stringify(galleryPolicy, null, 2);
        element("summary").textContent = item.description;
        if (updateUrl) history.replaceState(null, "", `?example=${item.id}`);
    }
    replace(new URL(location.href).searchParams.get("example") ?? "lines", false);
    update({status: "idle", message: "Idle / reset. Reload never restores a running job, result or applicable candidate."});
    select.addEventListener("change", () => replace(select.value));
    for (const input of [model, policy, ...["seed", "bet", "mode", "rounds"].map((id) => element(id))]) input.addEventListener("input", () => {
        // Revoke authority immediately; retain only the review for an explicit stale-Apply rejection.
        controller.invalidate();
        clear(true);
    });
    const focusAction = (): void => root.querySelector<HTMLButtonElement>("[data-action=inspect]")!.focus();
    for (const id of ["seed", "bet"]) element(id).addEventListener("input", () => {
        try {
            const request = JSON.parse(policy.value);
            request.policy.seed = element<HTMLInputElement>("seed").value;
            request.policy.stake = Number(element<HTMLInputElement>("bet").value);
            policy.value = JSON.stringify(request, null, 2);
        } catch {
            /* Invalid request text remains editable and cannot execute. */
        }
    });
    policy.addEventListener("input", () => {
        try {
            const request = JSON.parse(policy.value);
            if (typeof request.policy?.seed === "string") element<HTMLInputElement>("seed").value = request.policy.seed;
            if (typeof request.policy?.stake === "number") element<HTMLInputElement>("bet").value = String(request.policy.stake);
        } catch {
            /* Preserve malformed input for repair. */
        }
    });
    element("cancel").addEventListener("click", () => {
        controller.cancel();
        clear();
        focusAction();
    });
    element("reset").addEventListener("click", () => replace(select.value));
    element("restore").addEventListener("click", () => {
        if (!lastValid) {
            update({status: "failed", message: "No validated draft yet. Reset to a gallery example."});
            return;
        }
        controller.invalidate();
        clear();
        model.value = JSON.stringify(lastValid.blueprint, null, 2);
        element<HTMLInputElement>("seed").value = lastValid.settings.seed;
        element<HTMLInputElement>("bet").value = String(lastValid.settings.bet);
        element<HTMLInputElement>("mode").value = lastValid.settings.mode ?? "";
        element<HTMLInputElement>("rounds").value = String(lastValid.settings.rounds);
    });
    async function execute(action: string, extra?: unknown): Promise<void> {
        const focus = document.activeElement as HTMLElement | null;
        clear();
        const version = uiGeneration;
        try {
            const submitted = draft();
            let request: unknown = extra;
            if (action === "optimize") {
                if (policy.value.length > 65536) throw new Error("Policy exceeds 64 KiB limit.");
                const parsed = JSON.parse(policy.value);
                if (parsed.policy?.seed !== submitted.settings.seed || parsed.policy?.stake !== submitted.settings.bet) throw new Error("Policy seed/stake differs from run settings; update the request explicitly.");
                request = parsed;
            }
            const run = await controller.run(submitted, action, request);
            if (version !== uiGeneration) return;
            displayed = run;
            lastValid = structuredClone(run.draft);
            const {manifest} = run.artifact;
            element("identity").textContent = JSON.stringify(
                {
                    example: select.value,
                    revision: run.revision,
                    model: manifest.artifact!.configurationHash,
                    artifact: manifest.artifact!.sha256,
                    runtime: run.runtimeVersion,
                    serialization: manifest.serialization,
                    schema: manifest.schemaVersion,
                    ...run.draft.settings,
                    workerCount: 1,
                    initialCredits: POKIE_WASM_SIMULATION_CREDITS,
                    action,
                },
                null,
                2,
            );
            if (action === "sim" || action === "report") {
                reports = (run.result as {mode?: string; targetRtp?: number; statistics: SimulationStatistics}[]).map((item) => {
                    const report = new SimulationReportBuilder().build({
                        manifest: run.draft.blueprint.manifest,
                        requestedRounds: submitted.settings.rounds,
                        seed: submitted.settings.seed,
                        statistics: item.statistics,
                        workers: 1,
                        durationMs: run.durationMs,
                        betMode: item.mode,
                        targetRtp: item.targetRtp,
                        stopReason: "maxRounds",
                        configHash: manifest.artifact!.configurationHash,
                        pokieVersion: run.runtimeVersion,
                    });
                    report.reproducibility!.command = "node reproduce.mjs # use matching settings.json bet; CLI sim has no --bet flag";
                    return report;
                });
                const summaries = (reports as ReturnType<SimulationReportBuilder["build"]>[]).map(
                    (r) =>
                        `${r.betMode ?? "default"}: ${r.rounds} ${r.diagnostics?.sampleUnit} samples; ${
                            r.sampling?.acceptedSubrounds ?? r.rounds
                        } accepted steps; RTP ${r.rtp}; 95% empirical CI [${r.rtpConfidenceInterval95?.low}, ${
                            r.rtpConfidenceInterval95?.high
                        }]. ${(r.warnings ?? []).join(" ")}`,
                );
                element("summary").textContent = summaries.join("\n");
            } else if (action === "play" || action === "replay" || action === "replay-play") {
                const result = run.result as PokieWasmRound & {finalRound?: PokieWasmRound; rounds?: PokieWasmRound[]};
                const round = action === "play" ? result : result.finalRound ?? result.rounds?.[result.rounds.length - 1];
                if (round) {
                    renderScreen(round, run.draft.blueprint, element("screen"));
                    element("summary").textContent = `Accepted entry/step: stake ${round.stake}, win ${round.win ?? round.payout}, payout ${
                        round.payout
                    }. ${round.deliveryOnly ? "Delivery only: no new mathematical sample." : "Actual canonical runtime result."}`;
                }
                element<HTMLButtonElement>("replay-play").disabled = !run.replay;
            } else element("summary").textContent =
                    "Structurally valid and executable in the canonical runtime. Inspect/validate does not establish mathematical targets.";
            element("output").textContent = JSON.stringify(reports ?? run.result, null, 2);
            if (action === "optimize") {
                const result = run.result as {candidate?: GameBlueprint; status: string};
                candidate = result.candidate;
                element("preview").textContent = JSON.stringify(run.result, null, 2);
                element(
                    "summary",
                ).textContent = `Optimization ${result.status}; separate search and held-out assessment below. Candidate remains detached until explicit apply.`;
                element<HTMLButtonElement>("apply").disabled = !candidate;
                element<HTMLButtonElement>("discard").disabled = !candidate;
            }
            downloads();
        } catch (error) {
            if (version === uiGeneration) update({status: "failed", message: error instanceof Error ? error.message : String(error)});
        } finally {
            if (version === uiGeneration && document.activeElement === document.body && focus?.isConnected) focus.focus({preventScroll: true});
        }
    }
    root.querySelectorAll<HTMLButtonElement>("[data-action]").forEach((button) =>
        button.addEventListener("click", () => {
            execute(button.dataset.action!);
        }),
    );
    element("replay-play").addEventListener("click", () => {
        const replay = displayed?.replay;
        if (replay) execute("replay-play", replay);
    });
    element("discard").addEventListener("click", () => {
        controller.invalidate("Interrupted/reset: preview discarded; draft retained.");
        clear();
        focusAction();
    });
    element("apply").addEventListener("click", () => {
        (async () => {
            const version = uiGeneration;
            try {
                if (!candidate) throw new Error("No current candidate.");
                update({status: "validating", message: "Checking reviewed candidate against current inputs…"});
                const next = await controller.applyCandidate(draft(), JSON.parse(policy.value), candidate);
                if (version !== uiGeneration) return;
                model.value = JSON.stringify(next, null, 2);
                clear();
                focusAction();
                update({status: "idle", message: "Applied to draft. Inspect or run the new identity; download/save is separate."});
            } catch (error) {
                if (version !== uiGeneration) return;
                clear();
                update({status: "failed", message: error instanceof Error ? error.message : String(error)});
                focusAction();
            }
        })();
    });
    function downloads(): void {
        const run = displayed;
        if (!run) return;
        const state = run.replay;
        const settings = {
            schemaVersion: "pokie.playground.v1",
            status: "completed",
            revision: run.revision,
            artifact: run.artifact.manifest.artifact,
            runtimeVersion: run.runtimeVersion,
            example: select.value,
            ...run.draft.settings,
            workers: 1,
            initialCredits: POKIE_WASM_SIMULATION_CREDITS,
            sampleUnit: "accepted-step",
            action: run.action,
        };
        const items: [string, unknown, string?][] = [
            ["model.blueprint.json", run.draft.blueprint],
            ["model.wasm", run.artifact.bytes, "application/wasm"],
            ["model.wasm.pokie-wasm.json", run.artifact.manifest],
            ["settings.json", settings],
        ];
        if (reports) {
            const modes = reports as ReturnType<SimulationReportBuilder["build"]>[];
            const canonical =
                run.draft.settings.mode === "all"
                    ? {
                        game: modes[0].game,
                        requestedRounds: run.draft.settings.rounds,
                        seed: run.draft.settings.seed,
                        workers: 1,
                        modes: Object.fromEntries(modes.map((report) => [report.betMode!, report])),
                    }
                    : modes[0];
            items.push(["report.json", canonical], ["reports.json", reports]);
        }
        if (state) items.push(["replay.json", {artifact: run.artifact.manifest.artifact, ...state}]);
        if (run.action === "replay") items.push(["replay-observation.json", {authority: "public-observation; not audit recording", result: run.result}]);
        if (run.action === "optimize") {
            items.push(["optimization.json", run.result]);
            if (candidate) items.push(["candidate.blueprint.json", candidate]);
        }
        items.push([
            "run.json",
            {
                settings,
                blueprint: run.draft.blueprint,
                wasm: Array.from(run.artifact.bytes),
                manifest: run.artifact.manifest,
                reports,
                replay: state,
                observation: run.result,
            },
        ]);
        element("download-buttons").replaceChildren();
        for (const [name, value, mime] of items) {
            const button = document.createElement("button");
            button.textContent = `Download ${name}`;
            button.addEventListener("click", () => {
                let url: string | undefined;
                try {
                    if (displayed !== run) throw new Error("Download is stale; run again.");
                    const blob = new Blob([value instanceof Uint8Array ? new Uint8Array(value) : JSON.stringify(value, null, 2)], {
                        type: mime ?? "application/json",
                    });
                    url = URL.createObjectURL(blob);
                    const link = document.createElement("a");
                    link.href = url;
                    link.download = name;
                    document.body.append(link);
                    link.click();
                    link.remove();
                    element("download-status").textContent = `Downloaded ${name} for ${run.revision}.`;
                } catch (error) {
                    element("download-status").textContent = `Download failed: ${String(
                        error,
                    )}. Retry after checking browser download settings.`;
                } finally {
                    if (url) URL.revokeObjectURL(url);
                }
            });
            element("download-buttons").append(button);
        }
    }
    window.addEventListener("pagehide", () => {
        controller.dispose();
        clear();
    }, {once: true});
}

function renderScreen(round: PokieWasmRound, blueprint: GameBlueprint, host: HTMLElement): void {
    host.replaceChildren();
    const projection = blueprint.screenGeometry ? new ScreenProjection(blueprint.screenGeometry) : undefined;
    const screen = round.screen;
    if (projection) projection.assertMatrix(screen, "visible");
    const caption = document.createElement("p");
    caption.textContent = "Visible screen · coordinates [reel, row]. See complete output for generated/evaluated evidence.";
    host.append(caption);
    const grid = document.createElement("div");
    grid.className = "pg-grid";
    grid.style.gridTemplateColumns = `repeat(${screen.length}, minmax(2rem, 1fr))`;
    for (let row = 0; row < (screen[0]?.length ?? 0); row++) for (let reel = 0; reel < screen.length; reel++) {
        const cell = document.createElement("span");
        cell.textContent = String(screen[reel][row]);
        cell.dataset.coordinate = `${reel},${row}`;
        cell.title = `Visible [${reel}, ${row}]`;
        if (round.network?.winningPositions?.some((p) => p[0] === reel && p[1] === row)) {
            cell.className = "pg-win";
            cell.setAttribute("aria-label", `${cell.textContent}, winning visible cell ${reel}, ${row}`);
        }
        grid.append(cell);
    }
    host.append(grid);
}
