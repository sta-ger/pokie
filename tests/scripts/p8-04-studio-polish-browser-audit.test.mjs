import assert from "node:assert/strict";
import {test} from "@jest/globals";
import {JSDOM} from "jsdom";
import {waitForP804CreateGame} from "../../scripts/p8-04-studio-polish-browser-audit.mjs";

function renderedControl() {
    const dom = new JSDOM('<p>Create game saves your design.</p><button id="blueprint-create-game"><span>Create game</span></button>', {runScripts: "outside-only"});
    const button = dom.window.document.getElementById("blueprint-create-game");
    button.getClientRects = () => [{width: 120, height: 36}];
    button.getBoundingClientRect = () => ({width: 120, height: 36});
    return {dom, button, evaluate: expression => dom.window.eval(expression)};
}

test("guided creation waits through the validation debounce and disabled request before allowing activation", async () => {
    const {dom, button, evaluate} = renderedControl();
    const phases = ["idle", "loading", "ok"];
    let polls = 0;
    try {
        await waitForP804CreateGame(expression => {
            const phase = phases[polls++];
            button.setAttribute("data-pokie-validation-state", phase);
            button.disabled = phase !== "ok";
            if (phase === "loading") button.setAttribute("aria-busy", "true");
            else button.removeAttribute("aria-busy");
            return evaluate(expression);
        }, 1_000);
        assert.equal(polls, 3, "the rendered label cannot finish either pending phase");
        assert.equal(button.disabled, false);
    } finally {
        dom.window.close();
    }
});

test.each(["invalid", "error"])("guided creation retains %s validation diagnostics instead of authorizing a click", async validation => {
    const {dom, button, evaluate} = renderedControl();
    try {
        button.setAttribute("data-pokie-validation-state", validation);
        button.disabled = true;
        await assert.rejects(waitForP804CreateGame(evaluate, 0), error => {
            assert.match(error.message, new RegExp(`Automatic design validation ${validation}`));
            assert.match(error.message, new RegExp(`"validation":"${validation}"`));
            assert.match(error.message, /"disabled":true/);
            return true;
        });
    } finally {
        dom.window.close();
    }
});

test.each(["disabled", "busy", "hidden", "stale", "different-action", "label-only"])("successful validation cannot authorize a %s control", async state => {
    const {dom, button, evaluate} = renderedControl();
    try {
        button.setAttribute("data-pokie-validation-state", "ok");
        if (state === "disabled") button.disabled = true;
        if (state === "busy") button.setAttribute("aria-busy", "true");
        if (state === "hidden") button.getClientRects = () => [];
        if (state === "stale") button.setAttribute("data-pokie-validation-state", "stale");
        if (state === "different-action") button.textContent = "Save game";
        if (state === "label-only") button.id = "unrelated-control";
        await assert.rejects(waitForP804CreateGame(evaluate, 0), /Timed out waiting for rendered validation-ready Create game control; Create game readiness:/);
    } finally {
        dom.window.close();
    }
});
