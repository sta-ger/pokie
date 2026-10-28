import {ActionIcon, Alert, Button, DEFAULT_THEME, MantineProvider, defaultCssVariablesResolver, mergeMantineTheme} from "@mantine/core";
import {render, screen, waitFor, within} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {readFileSync} from "fs";
import {join} from "path";
import {parse} from "postcss";
import type {ComponentProps} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {AppShellLayout} from "../../../../../../cli/studio-client/src/components/layout/AppShellLayout";
import {AdvancedValidationPanel} from "../../../../../../cli/studio-client/src/components/common/AdvancedValidationPanel";
import {advancedUnknownReport} from "../../../../../v2/fixtures/AdvancedModelReport";
import {SimulationTab} from "../../../../../../cli/studio-client/src/components/project/SimulationTab";
import {featureAnalyticsReport} from "../../../../../v2/fixtures/FeatureAnalyticsFixture";
import {SimulationSummaryCard} from "../../../../../../cli/studio-client/src/components/common/SimulationSummaryCard";
import {describeSimulationReport} from "../../../../../../cli/studio-client/src/domain/interpret/Simulation";
import {theme} from "../../../../../../cli/studio-client/src/theme";
import {PathInput} from "../../../../../../cli/studio-client/src/components/common/PathInput";
import {StudioApiProvider} from "../../../../../../cli/studio-client/src/context/StudioApiProvider";

// jsdom cannot resolve custom properties. Resolve the actual provider variables and
// component inline variables, rather than substituting a hand-picked palette pair.
const productionTheme = mergeMantineTheme(DEFAULT_THEME, theme);
const providerVariables = defaultCssVariablesResolver(productionTheme);
const mantineCss = parse(readFileSync(join(__dirname, "../../../../../../node_modules/@mantine/core/styles.css"), "utf8"));
const studioCss = parse(readFileSync(join(__dirname, "../../../../../../cli/studio-client/src/global.css"), "utf8"));

function resolveCss(value: string, scheme: "light" | "dark", element?: HTMLElement): string {
    const variables = {...providerVariables.variables, ...providerVariables[scheme]};
    let resolved = value;
    // Resolve innermost fallbacks first, including the real Button/ActionIcon defaults.
    while (resolved.includes("var(")) {
        const next = resolved.replace(/var\((--[\w-]+)(?:,\s*([^()]+))?\)/g, (_, name: string, fallback?: string) =>
            element?.style.getPropertyValue(name) || variables[name] || fallback || "",
        );
        if (next === resolved) throw new Error(`Unresolved production CSS: ${value}`);
        resolved = next;
    }
    return resolved.replace(/light-dark\(([^,()]+),\s*([^()]+)\)/g, (_, light: string, dark: string) =>
        (scheme === "light" ? light : dark).trim());
}

function contrast(foreground: string, background: string): number {
    const luminance = (color: string): number => {
        if (color === "white") color = "#ffffff";
        const expanded = (/^#[a-f\d]{3}$/i).test(color) ? "#" + [...color.slice(1)].map(channel => channel + channel).join("") : color;
        const channels = expanded.startsWith("#") ? expanded.slice(1).match(/../g)!.map(value => parseInt(value, 16)) : color.match(/[\d.]+/g)!.map(Number);
        expect(channels).toHaveLength(3);
        const rgb = channels.map(channel => {
            const value = channel / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    };
    const values = [luminance(foreground), luminance(background)].sort((a, b) => b - a);
    return (values[0] + 0.05) / (values[1] + 0.05);
}

// Implementation regressions, not an independent visual-quality assessment.
it.each(["light", "dark"] as const)("keeps the actual path-validation callout readable and visually marked in %s mode", async scheme => {
    const user = userEvent.setup();
    const fetchImpl = () => Promise.resolve({ok: true, status: 200, json: () => Promise.resolve({status: "error", reason: "absent", resolvedPath: "/not/a/real/game", error: "ENOENT"})});
    render(<MantineProvider theme={theme} forceColorScheme={scheme}><StudioApiProvider fetchImpl={fetchImpl}>
        <PathInput label="Game location" value="/not/a/real/game" onPathSelected={() => undefined} />
    </StudioApiProvider></MantineProvider>);
    await user.click(screen.getByRole("textbox", {name: "Game location"}));
    const alert = await screen.findByRole("alert", {name: "Location needs attention"});
    expect(alert).toHaveClass("studio-path-issue", Alert.classes.root);
    const declarations: Record<string, string> = {};
    studioCss.walkRules(rule => {
        if (rule.selector === ".studio-path-issue") rule.walkDecls(declaration => {
            declarations[declaration.prop] = resolveCss(declaration.value, scheme, alert);
        });
    });
    const background = declarations["background-color"];
    expect(contrast(declarations.color, background)).toBeGreaterThanOrEqual(4.5);
    expect(declarations["border-inline-start"]).toMatch(/^4px solid /);
    expect(contrast(declarations["border-inline-start"].replace(/^4px solid /, ""), background)).toBeGreaterThanOrEqual(3);
    // Mantine's message overrides inherited title/icon colour with the scheme's
    // body colour. Resolve its actual upstream declaration as well.
    let messageColor = "";
    mantineCss.walkRules(rule => {
        if (rule.selector === `:where([data-mantine-color-scheme='${scheme}']) .${Alert.classes.message}`) {
            rule.walkDecls("color", declaration => {
                messageColor = resolveCss(declaration.value, scheme, alert);
            });
        }
    });
    expect(contrast(messageColor, background)).toBeGreaterThanOrEqual(4.5);
});

const report = describeSimulationReport({
    game: {id: "starter-slot", name: "Starter Slot", version: "0.1.0"},
    requestedRounds: 1000, rounds: 1000, seed: "36", totalBet: 50, totalWin: 48,
    rtp: 0.96, hitFrequency: 0.25, maxWin: 2, durationMs: 3100, spinsPerSecond: 320,
    rtpConfidenceInterval95: {low: 0.9, high: 1.02},
    sampling: {unit: "completed-logical-round", acceptedSubrounds: 1000, carriedSubrounds: 0,
        excludedSubrounds: 0, trajectories: "independent-session-per-worker"},
    diagnostics: {sampleUnit: "completed-logical-round", samples: 1000, achievedRtpHalfWidth: 0.06,
        precision: "notRequested", coverageLimitations: ["Rare outcomes may remain unseen."]},
});

it.each(["light", "dark"] as const)("gives the leading RTP a readable visual emphasis in %s mode", scheme => {
    const style = document.createElement("style");
    studioCss.walkRules(rule => {
        if (rule.selector.startsWith(".studio-simulation-metrics") || rule.selector.startsWith(".studio-simulation-primary-metrics")) {
            style.textContent += resolveCss(rule.toString(), scheme);
        }
    });
    document.head.append(style);
    try {
        render(<MantineProvider theme={theme} forceColorScheme={scheme}><SimulationSummaryCard outcome={{kind: "completed", report}} /></MantineProvider>);
        const metrics = screen.getByRole("table", {name: "Simulation summary"});
        expect(metrics).toHaveClass("studio-simulation-primary-metrics");
        const rows = within(metrics).getAllByRole("row");
        const leading = getComputedStyle(rows[0]);
        expect(contrast(leading.color, leading.backgroundColor)).toBeGreaterThanOrEqual(4.5);
        expect(leading.backgroundColor).not.toBe(getComputedStyle(rows[1]).backgroundColor);
        const value = getComputedStyle(within(rows[0]).getByRole("cell"));
        expect(value.fontWeight).toBe("700");
        expect(value.fontVariantNumeric).toBe("tabular-nums");
    } finally {
        style.remove();
    }
});

function props(): ComponentProps<typeof SimulationTab> {
    return {
        progress: undefined, error: undefined, cancellationRequested: false, operation: "simulation",
        terminalReceipt: undefined, onRun: jest.fn(), onCancel: jest.fn(), onRetry: jest.fn(),
        recentRuns: {status: "empty"}, recentRunsError: undefined, onRefreshRecentRuns: jest.fn(),
        reviewedDetail: {status: "empty"}, currentReportId: undefined, onOpenHistoric: jest.fn(),
        onRunAgain: jest.fn(), runAgainNotice: undefined, compareDetail: {status: "empty"},
        onCompare: jest.fn(), onClearCompare: jest.fn(), downloadUrls: undefined,
    };
}

it("prioritizes summary outcomes and precision while disclosing supporting explanations on live and reopened results", async () => {
    const p = props();
    const user = userEvent.setup();
    const result = render(<MantineProvider theme={theme}><SimulationTab {...p}
        historicalResult reviewedDetail={{status: "loaded", report}}
        downloadUrls={{json: "/report.json", markdown: "/report.md", html: "/report.html"}} /></MantineProvider>);
    expect(screen.getByText(/Historical simulation result/)).toBeVisible();
    const metrics = screen.getByRole("table", {name: "Simulation summary"});
    const toggle = screen.getByRole("button", {name: "Show sampling and precision"});
    const diagnostics = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(diagnostics).not.toBeVisible();
    expect(within(metrics.closest(".studio-simulation-summary")! as HTMLElement).getByText(/Rare outcomes/)).not.toBeVisible();
    expect(within(metrics.closest(".studio-simulation-summary")! as HTMLElement).getByText("Coverage limitations: 1 · Recommendations: 0")).toBeVisible();
    toggle.focus();
    await user.keyboard("{Enter}");
    expect(diagnostics).toBeVisible();
    expect(toggle).toHaveFocus();
    expect(metrics.compareDocumentPosition(diagnostics) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(within(metrics).getByText("96.00%")).toBeVisible();
    expect(within(diagnostics).getByText(/requested budget 1000/)).toBeVisible();
    const notesToggle = screen.getByRole("button", {name: "Show recommendations and limits"});
    notesToggle.focus();
    await user.keyboard(" ");
    expect(notesToggle).toHaveFocus();
    expect(within(metrics.closest(".studio-simulation-summary")! as HTMLElement).getByText(/Rare outcomes/)).toBeVisible();
    expect(within(metrics.closest(".studio-simulation-summary")! as HTMLElement).getByText(/neither establishes exact RTP/)).toBeVisible();
    const review = screen.getByRole("button", {name: /Review/});
    expect(review).toHaveAttribute("aria-current", "step");
    expect(review.closest(".studio-simulation-stepper")).not.toBeNull();
    await user.click(screen.getByRole("button", {name: /Export.*Download report/}));
    expect(screen.getByRole("link", {name: /JSON/})).toHaveAttribute("href", "/report.json");
    await user.click(review);
    await user.click(screen.getByRole("button", {name: "Repeat simulation"}));
    expect(p.onRetry).toHaveBeenCalledTimes(1);
    // Same production summary is used for a newly completed result.
    result.rerender(<MantineProvider theme={theme}><SimulationSummaryCard outcome={{kind: "completed", report}} /></MantineProvider>);
    expect(screen.getByRole("table", {name: "Simulation summary"})).toBeVisible();
    expect(screen.getByRole("button", {name: "Show sampling and precision"})).toHaveAttribute("aria-expanded", "false");
});

it("retains invalid-round feedback and disabled downstream steps before an explicit corrected run", async () => {
    const p = props();
    const user = userEvent.setup();
    render(<MantineProvider theme={theme}><SimulationTab {...p} /></MantineProvider>);
    expect(screen.getByRole("button", {name: /Review/})).toBeDisabled();
    const exportStep = screen.getByRole("button", {name: /Export.*Download report/});
    expect(exportStep).toBeDisabled();
    expect(exportStep).toHaveAttribute("aria-describedby", "simulation-export-unavailable");
    const rounds = screen.getByRole("textbox", {name: /Rounds/});
    await user.clear(rounds);
    await user.type(rounds, "0");
    expect(screen.getByRole("button", {name: "Run Simulation"})).toBeDisabled();
    expect(p.onRun).not.toHaveBeenCalled();
    await user.clear(rounds);
    await user.type(rounds, "1000");
    await user.click(screen.getByRole("button", {name: "Run Simulation"}));
    expect(p.onRun).toHaveBeenCalledWith(1000, undefined, 1, undefined, undefined);
});

it("retains per-mode caveats and keeps failed/cancelled outcomes separate from completed metrics", async () => {
    const user = userEvent.setup();
    const result = render(<MantineProvider theme={theme}><SimulationSummaryCard outcome={{kind: "completed", report: {
        game: report.game, requestedRounds: 1000, seed: "36", modes: {
            base: {...report, warnings: ["Low sample budget"], recommendations: ["Run more rounds"]},
            buy: {...report, rtp: 0.75},
        },
    }}} /></MantineProvider>);
    expect(screen.getAllByRole("table", {name: "Simulation summary"})).toHaveLength(2);
    for (const toggle of screen.getAllByRole("button", {name: "Show sampling and precision"})) {
        expect(toggle).toHaveAttribute("aria-expanded", "false");
    }
    expect(screen.getByText("96.00%")).toBeVisible();
    expect(screen.getByText("75.00%")).toBeVisible();
    expect(screen.getByText("Low sample budget")).toBeVisible();
    expect(screen.getByText("Run more rounds")).not.toBeVisible();
    const base = screen.getByText("Low sample budget").closest(".studio-simulation-summary")! as HTMLElement;
    await user.click(within(base).getByRole("button", {name: "Show recommendations and limits"}));
    expect(screen.getByText("Run more rounds")).toBeVisible();
    expect(screen.getByRole("button", {name: "Show recommendations and limits"})).toHaveAttribute("aria-expanded", "false");
    result.rerender(<MantineProvider theme={theme}><SimulationSummaryCard outcome={{kind: "failed", durationMs: 100, error: "Worker failed"}} /></MantineProvider>);
    expect(screen.getByText(/Worker failed/)).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    result.rerender(<MantineProvider theme={theme}><SimulationSummaryCard outcome={{kind: "cancelled", durationMs: 100, roundsCompleted: 12, rounds: 1000}} /></MantineProvider>);
    expect(screen.getByText(/12\/1000 rounds completed/)).toBeVisible();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
});

it("carries the public site's type and accessible brand palette into Studio", () => {
    const publicCss = readFileSync(join(__dirname, "../../../../../../site/site.css"), "utf8");
    expect(publicCss).toContain(`font-family: ${theme.fontFamily}`);
    expect(publicCss).toContain(`color: light-dark(${theme.black},`);
    expect(publicCss).toContain(`${theme.headings?.fontFamily}`);
    expect(publicCss).toContain(`color: light-dark(${theme.colors?.copper[8]},`);
    expect(publicCss).toContain(`background: light-dark(${theme.colors?.gray[1]},`);
    expect(readFileSync(join(__dirname, "../../../../../../cli/studio-client/src/main.tsx"), "utf8")).toContain('defaultColorScheme="auto"');
});

it.each(["light", "dark"] as const)("keeps public navigation, docs, gallery and playground readable in %s mode", scheme => {
    const css = parse(readFileSync(join(__dirname, "../../../../../../site/site.css"), "utf8"));
    const declarations = (...selectors: string[]): Record<string, string> => {
        const values: Record<string, string> = {};
        for (const selector of selectors) css.walkRules(rule => {
            if (!rule.selectors.includes(selector) || rule.parent?.type === "atrule") return;
            rule.walkDecls(declaration => {
                if (declaration.value !== "inherit") values[declaration.prop] = resolveCss(declaration.value, scheme);
            });
        });
        return values;
    };
    const root = declarations(":root");
    expect(root["color-scheme"]).toBe("light dark");
    const surfaces = [root,
        declarations(":root", "aside a"), declarations(":root", "aside a", "aside a[aria-current]"),
        declarations(":root", "#docs-navigation > summary:hover"),
        declarations(":root", "a"), declarations(":root", "a", "a:hover"),
        declarations(":root", "th"), declarations(":root", "p code"),
        declarations(":root", ".docs-index > ul > li"),
        declarations(":root", "#gallery > a", "#gallery p"),
        declarations(":root", "a", "#gallery > a"), declarations(":root", "a", "#gallery > a", "a:hover"),
        declarations(":root", "#playground"), declarations(":root", "#playground", ".eyebrow"),
        declarations(":root", "#playground input"), declarations(":root", "#playground select"),
        declarations(":root", "#playground textarea"), declarations(":root", "#playground pre"),
        declarations(":root", "button"), declarations(":root", "button", "button:hover:enabled"),
        declarations(":root", "#playground button"), declarations(":root", "#playground button", "#playground button:hover:enabled"),
        declarations(":root", "#pg-status"), declarations(":root", "#pg-status", '#pg-status[data-status="failed"]'),
        declarations(":root", "#pg-status", '#pg-status[data-status="running"]'),
        declarations(":root", ".pg-grid span"), declarations(":root", ".pg-grid span", ".pg-grid .pg-win"),
    ];
    for (const surface of surfaces) expect(contrast(surface.color, surface.background)).toBeGreaterThanOrEqual(4.5);
    const ring = (selector: string) => declarations(selector).outline.split(" ").at(-1)!;
    for (const background of [root.background, declarations(":root", "button:hover:enabled").background]) {
        expect(contrast(ring(":focus-visible"), background)).toBeGreaterThanOrEqual(3);
    }
    for (const background of [declarations("#playground").background, declarations("#gallery > a").background]) {
        expect(contrast(ring("#playground :focus-visible"), background)).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(declarations("header :focus-visible")["outline-color"], declarations("header").background)).toBeGreaterThanOrEqual(3);
});

it.each(["light", "dark"] as const)("resolves readable primary filled text and hover in %s mode through real controls", async scheme => {
    const user = userEvent.setup();
    const action = jest.fn();
    const controls = (disabled: boolean) => <MantineProvider theme={theme} forceColorScheme={scheme}>
        <Button disabled={disabled} onClick={action}>Default primary</Button>
        <Button variant="filled" color={productionTheme.primaryColor} disabled={disabled} onClick={action}>Explicit primary</Button>
        <ActionIcon variant="filled" disabled={disabled} onClick={action} aria-label="Primary icon">+</ActionIcon>
    </MantineProvider>;
    const result = render(controls(false));
    for (const control of screen.getAllByRole("button")) {
        const rootClass = control.classList.contains(Button.classes.root) ? Button.classes.root : ActionIcon.classes.root;
        const declarations: Record<string, string> = {};
        const hover: Record<string, string> = {};
        let hoverSelector = "";
        mantineCss.walkRules(rule => {
            if (rule.selector === `.${rootClass}`) rule.walkDecls(declaration => {
                declarations[declaration.prop] = declaration.value;
            });
            if (rule.selector.startsWith(`.${rootClass}:hover:`)) {
                hoverSelector = rule.selector.replace(":hover", "");
                rule.walkDecls(declaration => {
                    hover[declaration.prop] = declaration.value;
                });
            }
        });
        expect(control).toBeEnabled();
        expect(hoverSelector).toContain(":where(:not([data-loading], :disabled, [data-disabled]))");
        const color = resolveCss(declarations.color, scheme, control);
        const background = resolveCss(declarations.background, scheme, control);
        expect(contrast(color, background)).toBeGreaterThanOrEqual(4.5);
        await user.hover(control);
        expect(contrast(resolveCss(hover.color, scheme, control), resolveCss(hover["background-color"], scheme, control))).toBeGreaterThanOrEqual(4.5);
        await user.click(control);
        result.rerender(controls(true));
        expect(control).toBeDisabled();
        expect(control.matches(":disabled")).toBe(true);
        await user.click(control);
        result.rerender(controls(false));
        expect(control).toBeEnabled();
    }
    expect(action).toHaveBeenCalledTimes(3);
    // The brand foreground correction must preserve semantic palette and light status styles.
    const original = mergeMantineTheme(productionTheme, {primaryColor: "copper", autoContrast: false});
    for (const color of ["red", "yellow", "green", "blue", "orange", "teal"]) {
        expect(productionTheme.colors[color]).toEqual(DEFAULT_THEME.colors[color]);
        for (const variant of ["light", "filled"]) {
            const previous = original.variantColorResolver({theme: original, color, variant});
            const current = productionTheme.variantColorResolver({theme: productionTheme, color, variant});
            // Filled foregrounds may become dark for readability (e.g. yellow);
            // the semantic hue/background and all light status styles stay intact.
            if (variant === "light") expect(current).toEqual(previous);
            else expect(current).toMatchObject({background: previous.background, hover: previous.hover, border: previous.border});
        }
    }
});

it.each([["light", "breadcrumb"], ["dark", "breadcrumb"], ["light", "focus"], ["dark", "focus"]] as const)("keeps production %s masthead %s contrast", async (scheme, check) => {
    // Apply the real upstream focus rules followed by production masthead rules.
    // Inline Text color remains inline, so c="dimmed" cannot be hidden by this test.
    const style = document.createElement("style");
    mantineCss.walkRules(rule => {
        if (rule.selector.startsWith(".mantine-focus-")) style.textContent += resolveCss(rule.toString(), scheme);
    });
    studioCss.walkRules(rule => {
        if (rule.selector.startsWith(".studio-app-masthead")) style.textContent += resolveCss(rule.toString(), scheme);
    });
    document.head.append(style);
    try {
        const user = userEvent.setup();
        const navigate = jest.fn();
        const home = jest.fn();
        const layout = (guarded: boolean) => <MantineProvider theme={theme} forceColorScheme={scheme}>
            <AppShellLayout navbar={<button>Section</button>} onHomeClick={guarded ? home : undefined}
                breadcrumbs={[{label: "Your projects", onClick: navigate}, {label: "Starter Slot"}]}>
                Workspace
            </AppShellLayout>
        </MantineProvider>;
        const result = render(layout(false));
        const masthead = document.querySelector<HTMLElement>(".studio-app-masthead")!;
        const background = getComputedStyle(masthead).backgroundColor;
        const breadcrumb = screen.getByText("Starter Slot");
        if (check === "breadcrumb") {
            // This jsdom drops inline var() colors. Retain the real server-rendered
            // attribute before CSSStyleDeclaration parses it, then apply precedence.
            const markup = document.createElement("div");
            markup.innerHTML = renderToStaticMarkup(layout(false));
            const inline = markup.querySelector(".studio-app-breadcrumb-current")!.getAttribute("style") || "";
            let inlineColor = "";
            parse(`current {${inline}}`).walkDecls("color", declaration => {
                inlineColor = declaration.value;
            });
            const color = inlineColor || getComputedStyle(breadcrumb).color;
            expect(contrast(resolveCss(color, scheme, breadcrumb), background)).toBeGreaterThanOrEqual(4.5);
            return;
        }
        for (const guarded of [false, true]) {
            result.rerender(layout(guarded));
            const burger = screen.getByRole("button", {name: "Toggle navigation"});
            burger.focus();
            const brand = screen.getByRole(guarded ? "button" : "link", {name: "FromStan/POKIE Studio"});
            for (const control of [burger, brand, screen.getByRole("button", {name: "Your projects"})]) {
                expect(control).toHaveFocus();
                expect(control).toHaveClass("mantine-focus-auto");
                const outline = resolveCss(getComputedStyle(control).outline, scheme, control);
                expect(outline).toMatch(/^2px solid /);
                expect(getComputedStyle(control).outlineOffset).toMatch(/^(?:calc\(|[1-9])/);
                expect(contrast(outline.replace(/^2px solid /, ""), background)).toBeGreaterThanOrEqual(3);
                await user.tab();
            }
            screen.getByRole("button", {name: "Your projects"}).focus();
            await user.keyboard("{Enter}");
            if (guarded) {
                brand.focus();
                await user.keyboard("{Enter}");
            } else expect(brand).toHaveAttribute("href", "#/");
        }
        expect(navigate).toHaveBeenCalledTimes(2);
        expect(home).toHaveBeenCalledTimes(1);
    } finally {
        style.remove();
    }
});


it.each([false, true])("uses grouped full reports for historical=%s review and both comparisons, then restores the summary", async historicalResult => {
    const p = props();
    const user = userEvent.setup();
    const source = featureAnalyticsReport();
    const current = describeSimulationReport(source);
    const other = describeSimulationReport({...source, game: {...source.game, id: "comparison-source"},
        averagePayoutConfidenceInterval95: {low: 7.5, high: 8}});
    render(<MantineProvider theme={theme}><SimulationTab {...p} historicalResult={historicalResult}
        reviewedDetail={{status: "loaded", report: current}} compareDetail={{status: "loaded", report: other}} /></MantineProvider>);
    const summary = screen.getByRole("table", {name: "Simulation summary"});
    expect(summary).toHaveClass("studio-simulation-metrics");
    await user.click(screen.getByRole("button", {name: "Open full report"}));
    expect(screen.queryByRole("table", {name: "Simulation summary"})).not.toBeInTheDocument();
    expect(screen.getByRole("table", {name: "Simulation result metrics"})).toBeVisible();
    await user.click(screen.getByRole("button", {name: "Show analytical tables and feature detail"}));
    expect(screen.getByRole("table", {name: "Payout attribution"})).toBeVisible();
    const toggle = screen.getByRole("button", {name: "Show canonical hits and components"});
    await user.click(toggle);
    expect(screen.getByRole("table", {name: "Component statistics"})).toBeVisible();
    await user.click(screen.getByRole("button", {name: "Compare with another run"}));
    const comparison = screen.getByRole("group", {name: "Compare with another run"});
    expect(within(comparison).getAllByRole("table", {name: "Simulation result metrics"})).toHaveLength(2);
    const notes = within(comparison).getAllByRole("button", {name: "Show recommendations and limits"});
    expect(notes).toHaveLength(2);
    await user.click(notes[0]);
    expect(notes[0]).toHaveAttribute("aria-expanded", "true");
    expect(notes[1]).toHaveAttribute("aria-expanded", "false");
    for (const control of within(comparison).getAllByRole("button", {name: "Show run identity and accounting"})) await user.click(control);
    expect(within(comparison).getByText(/comparison-source/)).toBeVisible();
    expect(within(comparison).getByText("7.50 – 8.00")).toBeVisible();
    for (const control of within(comparison).getAllByRole("button", {name: "Show analytical tables and feature detail"})) await user.click(control);
    for (const control of within(comparison).getAllByRole("button", {name: "Show canonical hits and components"})) {
        expect(control).toHaveAttribute("aria-expanded", "false");
    }
    await user.click(screen.getByRole("button", {name: "Compare with another run"}));
    await user.click(screen.getByRole("button", {name: "Hide full report"}));
    expect(screen.getByRole("table", {name: "Simulation summary"})).toBeVisible();
});


it("keeps the analysis verdict visible and preserves optional absence, replacement and keyboard disclosure", async () => {
    const user = userEvent.setup();
    const original = advancedUnknownReport();
    const retained = JSON.stringify(original);
    const show = (report?: typeof original) => <MantineProvider theme={theme}><AdvancedValidationPanel report={report} /></MantineProvider>;
    const view = render(show(original));
    expect(screen.getByText(/budget-exhausted — inconclusive/)).toBeVisible();
    expect(screen.getByText("Declared initial state")).not.toBeVisible();
    const toggle = screen.getByRole("button", {name: "Show model analysis details"});
    const region = document.getElementById(toggle.getAttribute("aria-controls")!)!;
    expect(region).toHaveAttribute("hidden");
    toggle.focus();
    await user.keyboard(" ");
    expect(region).not.toHaveAttribute("hidden");
    expect(screen.getByText("Analysis assumptions")).toBeVisible();
    expect(screen.getByText("Analysis limitations")).toBeVisible();
    view.rerender(show({...original, status: "complete", verdict: "proved-within-assumptions", limitations: []}));
    expect(screen.getByText(/complete — proved-within-assumptions/)).toBeVisible();
    expect(screen.queryByText("Unfinished frontier")).not.toBeInTheDocument();
    await user.keyboard(" ");
    expect(region).toHaveAttribute("hidden");
    view.rerender(show());
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.queryByText(/Declared model analysis/)).not.toBeInTheDocument();
    view.rerender(show(original));
    expect(screen.getByRole("button", {name: "Show model analysis details"})).toHaveAttribute("aria-expanded", "false");
    expect(JSON.stringify(original)).toBe(retained);
});

it("shows one report or a comparison pair while retaining explicit detail and export controls", async () => {
    const user = userEvent.setup();
    render(<MantineProvider theme={theme}><SimulationTab {...props()}
        reviewedDetail={{status: "loaded", report}}
        compareDetail={{status: "loaded", report: {...report, rtp: 0.75}}}
        downloadUrls={{json: "/report.json", markdown: "/report.md", html: "/report.html"}} /></MantineProvider>);
    expect(screen.getAllByRole("table", {name: "Simulation summary"})).toHaveLength(1);
    await user.click(screen.getByRole("button", {name: "Open full report"}));
    expect(screen.queryByRole("table", {name: "Simulation summary"})).not.toBeInTheDocument();
    expect(screen.getAllByRole("table", {name: "Simulation result metrics"})).toHaveLength(1);
    for (const label of ["sampling and precision", "analytical tables and feature detail", "run identity and accounting"]) {
        expect(screen.getByRole("button", {name: `Show ${label}`})).toHaveAttribute("aria-expanded", "false");
    }
    await user.click(screen.getByRole("button", {name: "Compare with another run"}));
    await waitFor(() => expect(screen.getAllByRole("table", {name: "Simulation result metrics"})).toHaveLength(2));
    expect(screen.queryByRole("table", {name: "Simulation summary"})).not.toBeInTheDocument();
    const comparisonMetrics = screen.getAllByRole("table", {name: "Simulation result metrics"});
    expect(within(comparisonMetrics[0]).getByText("96.00%")).toBeVisible();
    expect(within(comparisonMetrics[1]).getByText("75.00%")).toBeVisible();
    await user.click(screen.getByRole("button", {name: "Open full report"}));
    await waitFor(() => expect(screen.getAllByRole("table", {name: "Simulation result metrics"})).toHaveLength(1));
    await user.click(screen.getByRole("button", {name: "Show run identity and accounting"}));
    expect(screen.getByRole("table", {name: "Run identity and accounting"})).toBeVisible();
    await user.click(screen.getByRole("button", {name: /Export.*Download report/}));
    expect(screen.getByRole("link", {name: "Download HTML"})).toHaveAttribute("href", "/report.html");
});
