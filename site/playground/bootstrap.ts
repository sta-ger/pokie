// Keep startup diagnostics independent of the runtime module graph. A failed
// import leaves the static controls disabled, never an apparently empty playground.
if (document.querySelector("#playground, #gallery")) {
    import("./app.js").catch(() => {
        const controls = document.querySelector<HTMLFieldSetElement>("#pg-controls");
        if (controls) controls.disabled = true;
        const help = document.querySelector<HTMLElement>("#pg-startup-help");
        if (help) help.hidden = false;
        const status = document.querySelector<HTMLElement>("#pg-status");
        if (status) {
            status.dataset.status = "failed";
            status.textContent = "Interactive controls could not start. Reload the playground to retry; no work has run.";
        }
    });
}
