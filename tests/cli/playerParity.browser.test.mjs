import assert from "node:assert/strict";
import {test} from "@jest/globals";
import {canonicalPlayerSelector, comparePlayerRegions} from "../../scripts/pc-12-player-parity-browser.mjs";

const region = {
    cells: [{id: "0:0", symbol: "cherry", color: "rgb(255, 255, 0)"}],
    wins: ["Line: 1, win: 10"],
    features: ["Free games3"],
    totals: ["100", "10.00", "2.00"],
    paytable: ["Symbol3", "cherry10"],
    controls: [{label: "Select bet 1", disabled: true, pressed: "true"}],
    hover: ["Line: 1, win: 10"],
    overflow: false,
};

test("PC-12 browser parity contract targets only the canonical player region", () => {
    assert.equal(canonicalPlayerSelector, '[data-pokie-player="canonical-v1"]');
    assert.doesNotThrow(() => comparePlayerRegions(region, {...region}));
});

test("PC-12 browser parity contract rejects material shared-player divergence", () => {
    assert.throws(() => comparePlayerRegions(region, {...region, controls: [{label: "Select bet 1", disabled: false, pressed: "true"}]}), /controls/);
    assert.throws(() => comparePlayerRegions(region, {...region, overflow: true}), /overflow/);
    assert.throws(() => comparePlayerRegions(region, {...region, cells: [{...region.cells[0], color: "rgb(0, 255, 0)"}]}), /cells/);
});
