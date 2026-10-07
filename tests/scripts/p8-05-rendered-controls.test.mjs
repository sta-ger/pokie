import assert from "node:assert/strict";
import {test} from "@jest/globals";
import {JSDOM} from "jsdom";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {MantineProvider, NumberInput} from "@mantine/core";
import {collectP805RenderedControls} from "../../scripts/p8-05-valera-browser-audit.mjs";

function page(markup) {
    const dom = new JSDOM(markup, {runScripts:"outside-only"});
    // Supply layout boxes even for hidden/inert entries: this reproduces the
    // old collector's overinclusive visibility test without a browser rerun.
    for (const item of dom.window.document.querySelectorAll('*')) item.getClientRects = () => [{width:120, height:36}];
    const collect = (focus = false) => JSON.parse(JSON.stringify(dom.window.eval(`(${collectP805RenderedControls.toString()})(${focus})`)));
    return {dom, collect};
}

test.each([0, 1])("Provably Fair's real Mantine Nonce=%s input excludes decorative number steppers", (nonce) => {
    const markup = renderToStaticMarkup(createElement(MantineProvider, {}, createElement(NumberInput, {id:"fairness-nonce", label:"Nonce", min:0, defaultValue:nonce})));
    const {dom, collect} = page(`<main>${markup}<button id="fairness-compute-commitments">Compute commitments</button></main>`);
    try {
        const legacyUnnamed = [...dom.window.document.querySelectorAll('button,a,input,select,textarea')]
            .filter((item) => !item.disabled && !(item.getAttribute('aria-label') || item.textContent || item.getAttribute('name'))?.trim());
        assert.equal(legacyUnnamed.filter((item) => item.matches('button[aria-hidden="true"]')).length, nonce === 0 ? 1 : 2, "the original collector reports enabled real Mantine steppers as unnamed actions");
        const state = collect();
        assert.deepEqual(state.controls.map((control) => [control.id, control.label, control.accessible]), [
            ['fairness-nonce', 'Nonce', true], ['fairness-compute-commitments', 'Compute commitments', true],
        ]);
        assert.equal(state.controls.filter((control) => !control.disabled && !control.accessible).length, 0);
        assert.equal(collect(true).visibleFocus, true, "recovery uses the same named public controls");
        assert.equal(dom.window.document.activeElement.id, 'fairness-nonce');
    } finally { dom.window.close(); }
});

test("workflow and recovery collectors exclude noninteractive and hidden entries but retain unnamed real actions", () => {
    const {dom, collect} = page(`
        <main><a id="empty-anchor"></a><input id="hidden-input" type="hidden">
        <div inert><button id="drawer-tab"></button></div>
        <div hidden><button id="hidden-button"></button></div>
        <div aria-hidden="true"><button id="decorative"></button></div>
        <button id="invisible" style="visibility:hidden"></button>
        <button id="collapsed" style="visibility:collapse"></button>
        <button id="unnamed" tabindex="-1"></button><a id="unnamed-link" href="#"></a>
        <button id="missing-reference" aria-labelledby="absent"></button>
        <input id="name-only" name="internal-name">
        <label for="client-seed">Client seed</label><input id="client-seed">
        <span id="first">Configure</span><span id="second">round</span>
        <button id="labelled" aria-label="ignored" aria-labelledby="first second"></button>
        <div id="custom-action" role="button" tabindex="0" aria-label="Verify proof"></div>
        <input id="submit" type="submit" value="Save"><button id="icon"><img alt="Export"></button></main>`);
    try {
        for (const focus of [false, true]) {
            const state = collect(focus);
            assert.deepEqual(state.controls.map((control) => control.id), ['unnamed', 'unnamed-link', 'missing-reference', 'name-only', 'client-seed', 'labelled', 'custom-action', 'submit', 'icon']);
            assert.deepEqual(state.controls.filter((control) => !control.disabled && !control.accessible).map((control) => control.id), ['unnamed', 'unnamed-link', 'missing-reference', 'name-only']);
            assert.deepEqual(state.controls.filter((control) => control.accessible).map((control) => control.label), ['Client seed', 'Configure round', 'Verify proof', 'Save', 'Export']);
            assert.equal(state.namedRegions, 1);
        }
    } finally { dom.window.close(); }
});

test("disabled native and ARIA actions require live explanations in both collection paths", () => {
    const {dom, collect} = page(`<main>
        <button id="explained" disabled aria-describedby="reason">Compute commitments</button>
        <p id="reason">Enter seeds first.</p>
        <button id="unexplained" disabled aria-describedby="absent">Generate proof</button>
        <button id="hidden-description" disabled aria-describedby="hidden-reason">Review</button><p id="hidden-reason" hidden>Verify first.</p>
        <div id="aria-disabled" role="button" tabindex="0" aria-disabled="true" title="Verify first">Diagnostics</div>
        <fieldset disabled><button id="fieldset-disabled">Build</button></fieldset>
        <button aria-hidden="true" disabled></button>
        <button id="ready">Verify</button></main>`);
    try {
        for (const focus of [false, true]) {
            const state = collect(focus);
            assert.equal(state.disabledControls, 5);
            assert.equal(state.explainedDisabledControls, 2);
            assert.equal(state.unexplainedDisabledControls, 3);
            assert.deepEqual(state.controls.filter((control) => control.disabled).map((control) => control.id), ['explained', 'unexplained', 'hidden-description', 'aria-disabled', 'fieldset-disabled']);
        }
        assert.equal(dom.window.document.activeElement.id, 'ready');
    } finally { dom.window.close(); }
});
