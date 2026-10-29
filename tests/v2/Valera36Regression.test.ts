import {JSDOM} from "jsdom";
import {readFileSync} from "node:fs";
import path from "node:path";
import {execFileSync} from "node:child_process";
import {runInNewContext} from "node:vm";
import {renderGallery, renderPlayground} from "../../site/playground/view.js";
import postcss from "postcss";
import {buildSimulationReportDownload} from "../../cli/studio/simulation/buildSimulationReportDownload.js";
import {describeSimulationReport} from "../../cli/studio-client/src/domain/interpret/Simulation.js";
import {formatConfidenceInterval} from "../../cli/studio-client/src/domain/interpret/formatConfidenceInterval.js";
import {featureAnalyticsReport} from "./fixtures/FeatureAnalyticsFixture.js";

describe("V2C-36 public navigation disclosure", () => {
    it.each(["/", "/help/"])("keeps native navigation, dismissal focus and unrelated drafts intact at %s", base => {
        const markup = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
            import fs from 'node:fs';
            import {renderNavigation} from './site/navigation.mjs';
            const pages = JSON.parse(fs.readFileSync('site/content.json', 'utf8')).pages;
            console.log(JSON.stringify(['/', '/docs/', '/gallery/', '/playground/', '/404.html'].map(route =>
                renderNavigation(pages, route, ${JSON.stringify(base)}))));
        `], {encoding: "utf8"})) as string[];
        for (const [index, html] of markup.entries()) {
            const dom = new JSDOM(`${html}<main id="main" tabindex="-1">
                <input id="docs-search"><button id="clear-search">Clear</button>
                <p id="search-status"></p><ul id="search-results"></ul>
                <textarea id="pg-model">unsaved draft</textarea><p id="pg-status">Completed run</p></main>`);
            try {
                const {document, KeyboardEvent} = dom.window;
                const details = document.querySelector<HTMLDetailsElement>("#docs-navigation")!;
                const summary = details.querySelector("summary")!;
                const close = document.querySelector<HTMLButtonElement>("#close-navigation")!;
                const links = [...details.querySelectorAll<HTMLAnchorElement>("nav a")];
                expect(details.open).toBe(false);
                expect(summary.textContent).toBe("Browse guides");
                expect(details.querySelector("nav")?.getAttribute("aria-label")).toBe("Documentation");
                expect(links.length).toBeGreaterThan(10);
                expect(links.every(link => link.getAttribute("href")?.startsWith(base))).toBe(true);
                expect(links.some(link => link.getAttribute("href")?.includes("404.html"))).toBe(false);
                expect(details.querySelectorAll('[aria-current="page"]')).toHaveLength(index === 4 ? 0 : 1);
                expect(close.hidden).toBe(true);
                // Native activation works before script startup or when JS is unavailable.
                summary.click();
                expect(details.open).toBe(true);
                summary.click();
                expect(details.open).toBe(false);

                runInNewContext(readFileSync("site/site.js", "utf8").replace("import.meta.url", JSON.stringify(`https://local.test${base}assets/site.js`)),
                    {document, URL});
                expect(close.hidden).toBe(false);
                const escape = () => new KeyboardEvent("keydown", {key: "Escape", bubbles: true, cancelable: true});
                const noop = escape();
                summary.dispatchEvent(noop);
                expect(noop.defaultPrevented).toBe(false);
                summary.click();
                links[0].focus();
                const handled = escape();
                handled.preventDefault();
                links[0].dispatchEvent(handled);
                expect(details.open).toBe(true);
                expect(document.activeElement).toBe(links[0]);
                summary.click();
                // Repeated open -> dismiss -> reuse exercises the same used element.
                for (let reuse = 0; reuse < 2; reuse++) {
                    summary.click();
                    links[0].focus();
                    const event = escape();
                    links[0].dispatchEvent(event);
                    expect(event.defaultPrevented).toBe(true);
                    expect(details.open).toBe(false);
                    expect(document.activeElement).toBe(summary);
                    summary.click();
                    close.focus();
                    close.click();
                    expect(details.open).toBe(false);
                    expect(document.activeElement).toBe(summary);
                }
                summary.click();
                const search = document.querySelector<HTMLInputElement>("#docs-search")!;
                search.focus();
                search.value = "unsubmitted query";
                search.dispatchEvent(escape());
                expect(search.value).toBe("");
                expect(details.open).toBe(true);
                expect(document.activeElement).toBe(search);
                expect(document.querySelector<HTMLTextAreaElement>("#pg-model")!.value).toBe("unsaved draft");
                expect(document.querySelector("#pg-status")!.textContent).toBe("Completed run");
            } finally {
                dom.window.close();
            }
        }
    });

    it("uses a rail only for an explicitly open desktop disclosure, leaving the 800px content full width", () => {
        const css = postcss.parse(readFileSync("site/site.css", "utf8"));
        const layout: {selector: string; media?: string; columns: string}[] = [];
        css.walkRules(rule => {
            if (!rule.selector.startsWith(".layout")) return;
            rule.walkDecls("grid-template-columns", declaration => {
                const parent = rule.parent;
                layout.push({selector: rule.selector, media: parent?.type === "atrule" ? parent.params : undefined,
                    columns: declaration.value});
            });
        });
        expect(layout).toEqual([
            {selector: ".layout", columns: "minmax(0, 1fr)"},
            {selector: ".layout:has(#docs-navigation[open])", media: "(min-width: 992px)",
                columns: "minmax(13rem, 17rem) minmax(0, 1fr)"},
        ]);
        const build = readFileSync("site/build.mjs", "utf8");
        expect(build).toContain("renderNavigation(renderedPages, page.route, base)");
        expect(build).toContain("'site/navigation.mjs'");
    });
});

// Source-aware V36-S1 regression. Independent first contact and fresh installed
// rechecks are controller-owned; this does not establish visual acceptance.
describe("V2C-36 report confidence interval units", () => {
    it.each([
        [{low: 0.9, high: 1.1}, "0.90 – 1.10"],
        [{low: 0.05, high: 7.5}, "0.05 – 7.50"],
        [{low: 0, high: 0}, "0.00 – 0.00"],
    ] as const)("agrees with the production HTML download for payout bounds %j", (interval, expected) => {
        const report = {...featureAnalyticsReport(), averagePayoutConfidenceInterval95: interval,
            rtpConfidenceInterval95: {low: 0.91, high: 0.99}};
        const original = JSON.stringify(report);
        // The canonical report wins over old, job-side statistics; formatting is
        // presentation only and must not recompute or mutate these values.
        const view = describeSimulationReport(report, {volatility: 0, payoutStandardDeviation: 0, returnStandardDeviation: 0,
            averagePayoutConfidenceInterval95: {low: 50, high: 60}, rtpConfidenceInterval95: {low: 5, high: 6}});
        const dom = new JSDOM(buildSimulationReportDownload(report, "valera36", "html").body);
        try {
            const rows = Array.from(dom.window.document.querySelectorAll("tr"));
            const cell = (label: string) => rows.find(row => row.cells[0]?.textContent === label)?.cells[1]?.textContent;
            expect(cell("Average payout 95% confidence interval")).toBe(expected);
            expect(formatConfidenceInterval(view.averagePayoutConfidenceInterval95, "payout")).toBe(expected);
            expect(cell("RTP 95% confidence interval")).toBe("91.00% – 99.00%");
            expect(formatConfidenceInterval(view.rtpConfidenceInterval95)).toBe("91.00% – 99.00%");
            expect(JSON.parse(buildSimulationReportDownload(report, "valera36", "json").body)).toEqual(report);
            expect(JSON.stringify(report)).toBe(original);
        } finally {
            dom.window.close();
        }
    });

    it("distinguishes unavailable intervals from measured zero and retains legacy job-side bounds", () => {
        const report = {...featureAnalyticsReport(), averagePayoutConfidenceInterval95: undefined,
            rtpConfidenceInterval95: undefined};
        const absent = describeSimulationReport(report);
        expect(formatConfidenceInterval(absent.averagePayoutConfidenceInterval95, "payout")).toBe("—");
        expect(formatConfidenceInterval(absent.rtpConfidenceInterval95)).toBe("—");
        const legacy = describeSimulationReport(report, {
            volatility: 0, payoutStandardDeviation: 0, returnStandardDeviation: 0,
            averagePayoutConfidenceInterval95: {low: 0, high: 0},
            rtpConfidenceInterval95: {low: 0, high: 0},
        });
        expect(formatConfidenceInterval(legacy.averagePayoutConfidenceInterval95, "payout")).toBe("0.00 – 0.00");
        expect(formatConfidenceInterval(legacy.rtpConfidenceInterval95)).toBe("0.00% – 0.00%");
    });
});

describe("V2C-36 tablet review layout contract", () => {
    const css = postcss.parse(readFileSync(path.resolve("cli/studio-client/src/global.css"), "utf8"));
    const declarations = (selector: string, width: number): Record<string, string> => {
        const values: Record<string, string> = {};
        css.walkRules(selector, rule => {
            const parent = rule.parent;
            if (parent?.type === "atrule" && parent.name === "media") {
                const maximum = parent.params.match(/^\(max-width: ([\d.]+)em\)$/);
                if (!maximum || width > Number(maximum[1]) * 16) return;
            }
            rule.walkDecls(declaration => {
                values[declaration.prop] = declaration.value;
            });
        });
        return values;
    };

    it.each([390, 800, 991, 992, 1440])("reclaims the rail space below 992px and keeps ordered step tracks at %ipx", width => {
        const main = declarations("#root .studio-app-main", width);
        expect(main["--app-shell-navbar-offset"]).toBe(width < 992 ? "0px" : undefined);
        expect(main["padding-inline"]).toBe(width < 992 ? "var(--mantine-spacing-md)" : undefined);
        const steps = declarations(".studio-simulation-stepper .mantine-Stepper-steps", width);
        expect(steps.display).toBe("grid");
        expect(steps["grid-template-columns"]).toBe(`repeat(${width <= 576 ? 2 : 4}, minmax(0, 1fr))`);
    });

    it("uses the public masthead and cream workspace without changing semantic status colours", () => {
        expect(declarations(".studio-app-masthead", 800)).toMatchObject({
            background: "#172d3b", color: "#fff9ed", "border-bottom": "4px solid #dc7653",
        });
        expect(declarations(".studio-app-main", 800).background).toContain("#f7f5ee");
        expect(declarations(".studio-page", 800)["--mantine-color-dimmed"]).toContain("#52636a");
        expect(declarations('.studio-output-status:is([data-status="Needs attention"], [data-status="Destination conflict"])', 800).color).toContain("--mantine-color-red-8");
    });
});


describe("V2C-36 compact metric composition", () => {
    it("fits metric groups to each report column and contains long values without changing other table surfaces", () => {
        const css = postcss.parse(readFileSync(path.resolve("cli/studio-client/src/global.css"), "utf8"));
        const rules: Record<string, Record<string, string>> = {};
        css.walkRules(rule => {
            if (!rule.selector.startsWith(".studio-simulation-metrics")) return;
            const declarations: Record<string, string> = {};
            rule.walkDecls(declaration => {
                declarations[declaration.prop] = declaration.value;
            });
            rules[rule.selector] = declarations;
        });
        expect(rules[".studio-simulation-metrics"]).toMatchObject({display: "block", width: "100%"});
        expect(rules[".studio-simulation-metrics > tbody"]).toMatchObject({display: "grid",
            "grid-template-columns": "repeat(auto-fit, minmax(min(100%, 13rem), 1fr))", gap: "var(--mantine-spacing-sm)"});
        expect(rules[".studio-simulation-metrics > tbody > tr"]).toMatchObject({display: "flex", "flex-direction": "column", "min-width": "0"});
        expect(rules[".studio-simulation-metrics > tbody > tr > :is(th, td)"]).toMatchObject({"text-align": "start", "overflow-wrap": "anywhere"});
        expect(rules[".studio-simulation-metrics > tbody > tr > td"]).toMatchObject({"font-variant-numeric": "tabular-nums"});
        expect(rules[".studio-simulation-metrics > tbody > tr"].background).toContain("light-dark(");
    });

    it("distinguishes primary outcomes from compact facts and lets assessment columns follow their container", () => {
        const css = postcss.parse(readFileSync("cli/studio-client/src/global.css", "utf8"));
        const declarations = (selector: string) => {
            const values: Record<string, string> = {};
            css.walkRules(rule => {
                if (rule.selectors.includes(selector) && rule.parent?.type !== "atrule") {
                    rule.walkDecls(d => {
                        values[d.prop] = d.value;
                    });
                }
            });
            return values;
        };
        expect(declarations(".studio-simulation-primary-metrics > tbody")["grid-template-columns"])
            .toBe("repeat(2, minmax(0, 1fr))");
        expect(declarations(".studio-simulation-primary-metrics")["container-type"]).toBe("inline-size");
        const containerColumns: Record<string, string> = {};
        css.walkAtRules("container", query => {
            query.walkRules(".studio-simulation-primary-metrics > tbody", rule => {
                rule.walkDecls("grid-template-columns", d => {
                    containerColumns[query.params] = d.value;
                });
            });
        });
        expect(containerColumns).toEqual({"(min-width: 40rem)": "repeat(4, minmax(0, 1fr))", "(max-width: 20rem)": "minmax(0, 1fr)"});
        expect(declarations(".studio-simulation-assessment")).toMatchObject({display: "grid",
            "grid-template-columns": "repeat(auto-fit, minmax(min(100%, 20rem), 1fr))"});
        expect(declarations(".studio-simulation-assessment > section")).toMatchObject({"min-width": "0", "overflow-wrap": "anywhere"});
        expect(declarations(".studio-simulation-facts :is(th, td)")).toMatchObject({padding: "0", "font-size": "var(--mantine-font-size-sm)"});
        // Secondary sampling counts remain a table rather than another KPI grid.
        const report = readFileSync("cli/studio-client/src/components/common/SimulationReportDisplay.tsx", "utf8");
        expect(report).toMatch(/<Table aria-label="Sampling and precision"[^>]*>/);
        expect(report).not.toMatch(/<Table aria-label="Sampling and precision"[^>]*studio-simulation-metrics/);
    });
});


describe("V2C-36 public interaction delivery", () => {
    it.each(["/", "/help/"])("renders the real gallery and guarded controls before hydration at %s", base => {
        // Invoke the actual Markdown/insertion owners, without running a site build.
        const pages = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
            import fs from 'node:fs';
            import {renderMarkdown} from './site/markdown.mjs';
            import {renderInteractiveContent} from './site/interactive.mjs';
            const {base, contracts} = JSON.parse(fs.readFileSync(0, 'utf8'));
            const pages = ['gallery', 'playground'].map(kind => {
                const markdown = fs.readFileSync('site/content/' + kind + '.md', 'utf8');
                return renderInteractiveContent(renderMarkdown(markdown, url => url).html, '/' + kind + '/', base, contracts);
            });
            for (const invalid of [{html: '', contracts}, {html: '<p>POKIEPLAYGROUND</p>', contracts: {}}]) {
                let rejected = false;
                try { renderInteractiveContent(invalid.html, '/playground/', base, invalid.contracts); }
                catch { rejected = true; }
                if (!rejected) throw new Error('Missing controls must fail closed');
            }
            console.log(JSON.stringify(pages));
        `], {encoding: "utf8", input: JSON.stringify({base, contracts: {
            galleryHtml: renderGallery(base), playgroundHtml: renderPlayground(base),
        }})})) as {html: string; script: string}[];
        const dom = new JSDOM(pages.map(page => page.html).join(""));
        try {
            const document = dom.window.document;
            const links = document.querySelectorAll<HTMLAnchorElement>("#gallery a");
            expect(links).toHaveLength(7);
            expect([...links].every(link => link.getAttribute("href")?.startsWith(`${base}playground/?example=`))).toBe(true);
            expect(document.querySelector('a[href="#pg-example"]')?.textContent).toBe("Choose an example");
            const chooser = document.querySelector<HTMLSelectElement>("#pg-example")!;
            expect(chooser.options).toHaveLength(7);
            const controls = document.querySelector<HTMLFieldSetElement>("#pg-controls")!;
            expect(controls.disabled).toBe(true);
            expect(document.querySelector("#pg-model")?.textContent).toContain('"gallery-lines"');
            expect([...document.querySelectorAll("[data-action]")].map(button => button.getAttribute("data-action")))
                .toEqual(["inspect", "validate", "play", "sim", "report", "replay", "optimize"]);
            expect(document.querySelector("#pg-status")?.textContent).toContain("Loading interactive controls");
            expect(document.querySelector("#pg-startup-help a")?.getAttribute("href")).toBe(`${base}playground/`);
            expect(document.querySelector(".pg-optimizer")?.hasAttribute("open")).toBe(false);
            expect(pages.every(page => page.script === `<script type="module" src="${base}assets/playground/playground.js"></script>`)).toBe(true);
            expect(dom.window.document.querySelectorAll("#playground")).toHaveLength(1);
        } finally {
            dom.window.close();
        }
    });

    it("keeps startup failure safe, then executes and recovers the real mounted actions through canonical WASM", () => {
        const output = execFileSync(process.execPath, ["--no-warnings", "--experimental-vm-modules", "--loader", "./site/source-loader.mjs", "--input-type=module", "-e", `
            import assert from 'node:assert/strict';
            import fs from 'node:fs';
            import vm from 'node:vm';
            import ts from 'typescript';
            import {JSDOM} from 'jsdom';
            import {renderPlayground} from './site/playground/view.ts';
            import {PokieWasmWorkerProtocol} from './src/wasm/worker.ts';
            import {GameBlueprintValidator} from './src/generated/GameBlueprintValidator.ts';
            import {PlaygroundController, validatePlaygroundDraft} from './site/playground/controller.ts';
            const dom = new JSDOM('<div id="playground">' + renderPlayground('/help/') + '</div>', {url: 'http://localhost/help/playground/?example=lines'});
            for (const name of ['document', 'window', 'location', 'history']) globalThis[name] = dom.window[name];
            const source = ts.transpileModule(fs.readFileSync('site/playground/bootstrap.ts', 'utf8'), {compilerOptions: {module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022}}).outputText;
            const bootstrap = new vm.SourceTextModule(source, {context: vm.createContext({document}), importModuleDynamically: () => Promise.reject(new Error('retained unavailable module'))});
            await bootstrap.link(() => { throw new Error('unexpected static import'); });
            await bootstrap.evaluate();
            await new Promise(resolve => setImmediate(resolve));
            assert.equal(document.querySelector('#pg-controls').disabled, true);
            assert.equal(document.querySelector('#pg-status').dataset.status, 'failed');
            assert.match(document.querySelector('#pg-status').textContent, /could not start/);
            assert.equal(document.querySelector('#pg-startup-help').hidden, false);
            let workers = 0;
            globalThis.Worker = class {
                listeners = new Map();
                protocol = new PokieWasmWorkerProtocol();
                constructor() { workers++; }
                addEventListener(type, listener) { this.listeners.set(type, listener); }
                removeEventListener(type) { this.listeners.delete(type); }
                terminate() { workers--; this.protocol.handle({id:'dispose', type:'dispose'}); }
                postMessage(value) { this.protocol.handle(value.request).then(response => this.listeners.get('message')?.({data: {...response, scope:value.scope, type:'response'}})); }
            };
            await import('./site/playground/app.ts');
            assert.equal(document.querySelector('#pg-controls').disabled, false);
            assert.equal(document.querySelector('#pg-startup-help').hidden, true);
            const run = async (action, status) => {
                document.querySelector('[data-action=' + action + ']').click();
                const deadline = Date.now() + 10000;
                while (!['completed', 'failed'].includes(document.querySelector('#pg-status').dataset.status)) {
                    if (Date.now() > deadline) throw new Error('action did not terminate');
                    await new Promise(resolve => setTimeout(resolve, 1));
                }
                assert.equal(document.querySelector('#pg-status').dataset.status, status, document.querySelector('#pg-status').textContent);
                assert.equal(workers, 0);
            };
            await run('play', 'completed');
            const original = document.querySelector('#pg-model').value;
            const edit = text => { const e = document.querySelector('#pg-model'); e.value = text; e.dispatchEvent(new window.Event('input')); };
            const malformed = JSON.parse(original); malformed.availableBets = [0];
            const malformedDraft = {blueprint: malformed, settings: {seed: 'gallery-29', bet: 0.05, rounds: 256}};
            assert.ok(new GameBlueprintValidator().validate(malformed).some(issue => issue.code === 'blueprint-availablebets-invalid' && issue.message.includes('availableBets')));
            assert.throws(() => validatePlaygroundDraft(malformedDraft), /availableBets/);
            const boundary = new PlaygroundController(() => new Worker(), () => {});
            await assert.rejects(boundary.prepare(malformedDraft), /availableBets/);
            await assert.rejects(boundary.run(malformedDraft, 'validate'), /availableBets/);
            assert.deepEqual(malformed.availableBets, [0]);
            for (let reuse = 0; reuse < 2; reuse++) await boundary.run({...malformedDraft, blueprint: JSON.parse(original)}, 'play');
            assert.deepEqual(boundary.diagnostics(), {workers: 0, timers: 0, pending: 0});
            edit(JSON.stringify(malformed));
            await run('validate', 'failed');
            assert.match(document.querySelector('#pg-status').textContent, /availableBets/);
            assert.equal(document.querySelector('#pg-model').value, JSON.stringify(malformed));
            assert.equal(document.querySelectorAll('#pg-download-buttons button').length, 0);
            document.querySelector('#pg-restore').click();
            assert.equal(document.querySelector('#pg-model').value, original);
            for (let reuse = 0; reuse < 2; reuse++) await run('play', 'completed');
            const identity = JSON.parse(document.querySelector('#pg-identity').textContent);
            assert.equal(identity.seed, 'gallery-29'); assert.equal(identity.bet, 0.05);
            assert.equal(identity.action, 'play'); assert.match(identity.artifact, /^sha256:[a-f0-9]{64}$/);
            window.dispatchEvent(new window.PageTransitionEvent('pagehide'));
            assert.equal(document.querySelectorAll('#pg-download-buttons button').length, 0);
            assert.equal(workers, 0);
            dom.window.close();
            console.log('PASS static startup failure; mounted play -> malformed validation -> restore -> play -> play; canonical WASM; no owned Workers');
        `], {encoding: "utf8", timeout: 30000});
        expect(output).toContain("PASS static startup failure; mounted play -> malformed validation -> restore -> play -> play; canonical WASM; no owned Workers");
    });
});

describe("V2C-36 public visual landmarks", () => {
    it.each(["/", "/help/"])("retains accessible fragment links and grouped real guide destinations at %s", base => {
        const pages = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
            import fs from 'node:fs';
            import {renderMarkdown} from './site/markdown.mjs';
            const source = fs.readFileSync('site/content/docs.md', 'utf8');
            const render = source => renderMarkdown(source, url => ${JSON.stringify(base)} + url);
            console.log(JSON.stringify([render(source), render('# Same title\\n\\n## Same title\\n\\n### A & B')]));
        `], {encoding: "utf8"})) as {html: string; headings: {id: string}[]}[];
        for (const page of pages) {
            const dom = new JSDOM(page.html);
            try {
                const document = dom.window.document;
                const links = [...document.querySelectorAll<HTMLAnchorElement>(".permalink")];
                expect(links).toHaveLength(page.headings.length);
                expect(new Set(page.headings.map(heading => heading.id)).size).toBe(page.headings.length);
                for (const [index, link] of links.entries()) {
                    expect(link.textContent?.trim()).toBe("");
                    expect(link.getAttribute("href")).toBe(`#${page.headings[index].id}`);
                    expect(document.getElementById(page.headings[index].id)).toBe(link.parentElement);
                    expect(link.getAttribute("aria-label")).toMatch(/^Link to .+/);
                    expect(link.tabIndex).toBe(0);
                    expect(link.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
                }
                if (page === pages[0]) {
                    expect(document.querySelectorAll("ul > li")).toHaveLength(11);
                    for (const guide of ["getting-started", "studio", "mechanics", "cli-api", "reproducibility", "optimization", "interop", "extraction", "weighted-sequences", "architecture", "server"]) {
                        expect(document.querySelector(`li strong a[href="${base}${guide}.md"]`)).not.toBeNull();
                    }
                }
            } finally {
                dom.window.close(); 
            }
        }
        const css = postcss.parse(readFileSync("site/site.css", "utf8"));
        const rules: Record<string, Record<string, string>> = {};
        css.walkRules(rule => {
            rules[rule.selector] ??= {};
            rule.walkDecls(declaration => {
                rules[rule.selector][declaration.prop] = declaration.value; 
            });
        });
        expect(rules[".permalink"].opacity).toBe("0");
        expect(rules[":is(h1, h2, h3, h4, h5, h6):hover .permalink, .permalink:focus-visible"].opacity).toBe("1");
        expect(rules[".docs-index > ul"]["grid-template-columns"]).toBe("repeat(auto-fit, minmax(min(100%, 16rem), 1fr))");
    });

    it.each(["/", "/help/"])("pairs every Gallery deep link with authored topology and a readable description at %s", base => {
        const dom = new JSDOM(`<div id="gallery">${renderGallery(base)}</div>`);
        try {
            const cards = [...dom.window.document.querySelectorAll<HTMLAnchorElement>("#gallery > a")];
            expect(cards.map(card => card.getAttribute("href"))).toEqual(["lines", "ways", "clusters", "free-games", "weighted", "projection", "optimize"].map(id => `${base}playground/?example=${id}`));
            expect(cards.map(card => card.querySelectorAll("svg rect").length)).toEqual([2, 6, 4, 2, 2, 2, 2]);
            for (const card of cards) {
                expect(card.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
                expect(card.querySelector("h2")?.textContent).toBeTruthy();
                expect(card.querySelector("p")?.textContent).toBeTruthy();
                expect(card.querySelector(".gallery-action")?.textContent).toBe("Open example →");
            }
        } finally {
            dom.window.close(); 
        }
    });
});
