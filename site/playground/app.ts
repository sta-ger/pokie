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

const gallery = document.querySelector<HTMLElement>("#gallery");
if (gallery) for (const item of galleryModels) {
    const card = document.createElement("a");
    card.href = `/playground/?example=${item.id}`;
    const title = document.createElement("h2"),
        text = document.createElement("p"),
        arrow = document.createElement("span");
    title.textContent = item.name;
    text.textContent = item.description;
    arrow.textContent = "Open example →";
    card.append(title, text, arrow);
    gallery.append(card);
}
const host = document.querySelector<HTMLElement>("#playground");
if (host) mount(host);

function mount(root: HTMLElement): void {
    root.innerHTML = `<div class="pg-heading"><span class="eyebrow">LOCAL WORKER / CANONICAL WASM</span><h2>Make the math observable.</h2><p>Choose a model, set the seed and run. Every result carries its inputs. Nothing is saved automatically.</p></div>
<div class="pg-inputs"><label>Example<select id="pg-example"></select></label><label>Seed<input id="pg-seed" value="gallery-29" maxlength="256"></label><label>Denomination<input id="pg-bet" type="number" step="any" value="0.05" list="pg-bets"><datalist id="pg-bets"><option value="0.05"></option><option value="7.5"></option><option value="1e-7"></option></datalist></label><label>Mode<input id="pg-mode" placeholder="default / declared ID / all"></label><label>Accepted steps<input id="pg-rounds" type="number" value="256" min="1" max="8192"></label></div>
<details class="pg-editor"><summary>Edit the Blueprint</summary><label for="pg-model">Authored JSON · maximum 64 KiB</label><textarea id="pg-model" rows="16" spellcheck="false"></textarea><button id="pg-restore" type="button">Restore last valid draft</button></details>
<div class="pg-actions" aria-label="Runtime actions"><button data-action="inspect">Inspect</button><button data-action="validate">Validate</button><button data-action="play">Play seeded entry</button><button data-action="sim">Simulate</button><button data-action="report">Build report</button><button data-action="replay">Replay sample</button><button id="pg-replay-play" disabled>Replay displayed entry</button><button id="pg-cancel" disabled>Cancel</button><button id="pg-reset">Reset</button></div>
<p id="pg-status" role="status" aria-live="polite" data-status="idle">Idle. Reload resets all work, results and previews.</p><progress aria-label="Completed work" aria-describedby="pg-status" id="pg-progress" max="1" value="0" hidden></progress>
<section class="pg-result" aria-label="Results"><h3>Run identity</h3><pre tabindex="0" id="pg-identity">No validated run yet.</pre><div id="pg-screen" aria-label="Visible screen"></div><p id="pg-summary">Use Inspect to check executable support before running.</p><details><summary>Complete observed output</summary><pre tabindex="0" id="pg-output">No output.</pre></details></section>
<details class="pg-optimizer" open><summary>Optimization · preview then apply</summary><p>Simple base line paytables only. One Worker, at most 16 candidates and 8192 search / assessment observations. Sampled estimates can be inconclusive; they do not prove configured RTP.</p><label for="pg-policy">Optimization request · seed and stake stay synchronized above</label><textarea id="pg-policy" rows="10" spellcheck="false"></textarea><button data-action="optimize">Generate candidate preview</button><button id="pg-apply" disabled>Apply reviewed candidate</button><button id="pg-discard" disabled>Discard preview</button><pre tabindex="0" id="pg-preview">No candidate.</pre></details>
<section class="pg-downloads"><h3>Reproduce this revision</h3><p>Downloads contain the validated current draft and actual observed output. A public round is an observation, not an audit recording. Only the separately labelled runtime state can be restored.</p><div id="pg-download-buttons"></div><p id="pg-download-status" role="status"></p><a href="/playground/#reproduce-downloads-locally">Local reproduction and support boundaries →</a></section>`;
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
        () => new Worker("/assets/playground/worker.js", {type: "module", name: "POKIE public playground"}) as PokieWasmWorkerPort,
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
        const progress = element<HTMLProgressElement>("progress");
        progress.hidden = !busy;
        progress.max = event.progress?.total ?? 1;
        progress.value = event.progress?.completed ?? 0;
    }
    function clear(): void {
        uiGeneration++;
        displayed = undefined;
        candidate = undefined;
        reports = undefined;
        element("identity").textContent = "Inputs changed. Run again to bind a current identity.";
        element("output").textContent = "No current output.";
        element("preview").textContent = "No current candidate.";
        element("summary").textContent = "No current result. Run again with the current inputs.";
        element("download-status").textContent = "";
        element("screen").replaceChildren();
        element("download-buttons").replaceChildren();
        for (const id of ["apply", "discard", "replay-play"]) element<HTMLButtonElement>(id).disabled = true;
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
    for (const item of galleryModels) {
        const option = document.createElement("option");
        option.value = item.id;
        option.textContent = item.name;
        select.append(option);
    }
    replace(new URL(location.href).searchParams.get("example") ?? "lines", false);
    update({status: "idle", message: "Idle / reset. Reload never restores a running job, result or applicable candidate."});
    select.addEventListener("change", () => replace(select.value));
    for (const input of [model, policy, ...["seed", "bet", "mode", "rounds"].map((id) => element(id))]) input.addEventListener("input", () => {
        controller.invalidate();
        clear();
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
            try {
                if (!candidate) throw new Error("No current candidate.");
                const next = await controller.applyCandidate(draft(), JSON.parse(policy.value), candidate);
                model.value = JSON.stringify(next, null, 2);
                clear();
                focusAction();
                update({status: "idle", message: "Applied to draft. Inspect or run the new identity; download/save is separate."});
            } catch (error) {
                update({status: "failed", message: String(error)});
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
