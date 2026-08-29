import assert from "node:assert/strict";
import {spawnSync} from "node:child_process";
import {resolve} from "node:path";
import {deflateSync} from "node:zlib";
import {test} from "@jest/globals";
import {
    canonicalPlayerComparisonKeys,
    canonicalPlayerSelector,
    comparePlayerRegions,
    comparePlayerScreenshots,
} from "../../scripts/pc-12-player-parity-browser.mjs";

const region = {
    cells: [{id: "0:0", symbol: "cherry", color: "rgb(255, 255, 0)"}],
    wins: ["Line: 1, win: 10"],
    features: ["Free games3"],
    totals: ["100", "10.00", "2.00"],
    paytable: ["Symbol3", "cherry10"],
    controls: [{label: "Select bet 1", disabled: true, pressed: "true"}],
    hover: ["Line: 1, win: 10"],
    styles: {player: {display: "block"}, grid: {display: "table"}},
    layout: {player: {width: 600, height: 420}, grid: {width: 240, height: 180}},
    overflow: false,
};

function png(width, height, pixels) {
    const chunk = (type, data) => {
        const length = Buffer.alloc(4);
        length.writeUInt32BE(data.length);
        return Buffer.concat([length, Buffer.from(type), data, Buffer.alloc(4)]);
    };
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = 6;
    const rows = [];
    for (let row = 0; row < height; row++) rows.push(Buffer.from([0]), pixels.subarray(row * width * 4, (row + 1) * width * 4));
    return Buffer.concat([Buffer.from("89504e470d0a1a0a", "hex"), chunk("IHDR", header), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}

test("PC-12 browser parity contract targets only the canonical player region", () => {
    assert.equal(canonicalPlayerSelector, '[data-pokie-player="canonical-v1"]');
    assert.deepEqual(canonicalPlayerComparisonKeys, ["cells", "wins", "features", "totals", "paytable", "controls", "hover", "styles", "layout", "overflow"]);
    assert.doesNotThrow(() => comparePlayerRegions(region, {...region}));
});

test("PC-12 browser parity contract rejects material shared-player divergence", () => {
    assert.throws(() => comparePlayerRegions(region, {...region, controls: [{label: "Select bet 1", disabled: false, pressed: "true"}]}), /controls/);
    assert.throws(() => comparePlayerRegions(region, {...region, overflow: true}), /overflow/);
    assert.throws(() => comparePlayerRegions(region, {...region, cells: [{...region.cells[0], color: "rgb(0, 255, 0)"}]}), /cells/);
    assert.throws(() => comparePlayerRegions(region, {...region, styles: {...region.styles, player: {display: "grid"}}}), /styles/);
    assert.throws(() => comparePlayerRegions(region, {...region, layout: {...region.layout, player: {width: 600, height: 520}}}), /layout/);
});

test("PC-12 browser parity compares canonical screenshots as pixels, with an anti-aliasing tolerance", () => {
    const matching = png(2, 1, Buffer.from([255, 255, 0, 255, 0, 255, 0, 255]));
    assert.deepEqual(comparePlayerScreenshots(matching, matching), {width: 2, height: 1, changedRatio: 0, meanDifference: 0});

    const divergent = png(2, 1, Buffer.from([0, 0, 255, 255, 0, 255, 0, 255]));
    assert.throws(() => comparePlayerScreenshots(matching, divergent), /screenshot diverged/);
});

test("PC-12 browser parity invokes its executable runner before browser setup", () => {
    const execution = spawnSync(process.execPath, [resolve(process.cwd(), "scripts/pc-12-player-parity-browser.mjs")], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {PATH: process.env.PATH ?? ""},
    });

    assert.equal(execution.status, 1);
    assert.match(execution.stderr, /PC_12_STUDIO_PROJECT must name the deterministic same-game fixture package/);
});
