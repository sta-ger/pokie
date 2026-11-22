import {expect, test} from "@playwright/test";

test("Home opens at the top with the design intro visible", async ({page}) => {
    await page.goto("/#/home/design");
    await expect(page.getByRole("heading", {name: "Design Your Game"})).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test("a duplicate symbol rename is rejected visibly and keeps the persisted id", async ({page}) => {
    await page.goto("/#/home/design");
    await page.getByRole("tab", {name: /Symbols/}).click();
    const symbolOne = page.getByRole("textbox", {name: "Symbol 1 id"});
    await symbolOne.fill("K");
    await symbolOne.press("Tab");
    await expect(page.getByRole("alert").filter({hasText: 'Cannot rename "A" to "K": that symbol id already exists.'}).first()).toBeVisible();
    await expect(page.getByRole("textbox", {name: "Symbol 1 id"})).toHaveValue("A");
});

test("the advanced file controls explain that they are not the managed project location", async ({page}) => {
    await page.goto("/#/home/design");
    await page.getByRole("button", {name: /advanced options/}).click();
    await expect(page.getByText(/These are file tools for a Blueprint JSON copy/)).toBeVisible();
});

test.describe.serial("managed project labels", () => {
    test("creates the starter project through the browser", async ({page}) => {
        await page.goto("/#/home/design");
        const create = page.getByRole("button", {name: "Create game"});
        await expect(create).toBeEnabled({timeout: 45_000});
        await create.click();
        await expect(page.getByRole("button", {name: "Overview", exact: true})).toBeVisible({timeout: 90_000});
    });

    test("optimization exposes a target and tunable fields without opening JSON", async ({page}) => {
        await page.goto("/");
        await expect(page.getByText("Math target", {exact: true})).toBeVisible({timeout: 60_000});
        await expect(page.getByRole("combobox", {name: "Metric"})).toBeVisible();
        await expect(page.getByText("Fields to tune", {exact: true})).toBeVisible();
        const fieldTable = page.getByRole("table", {name: "Fields available for tuning"});
        await expect(fieldTable.getByRole("checkbox").first()).toBeVisible();
        await expect(page.getByLabel("Optimization request JSON")).toBeHidden();
        await page.getByRole("button", {name: /expert JSON policy/}).click();
        const jsonEditor = page.getByLabel("Optimization request JSON");
        await expect(jsonEditor).toBeVisible();
        const request = JSON.parse(await jsonEditor.inputValue()) as {targets: {value: number}[]};
        request.targets[0].value = 0.96;
        await jsonEditor.fill(JSON.stringify(request, null, 2));
        await expect(page.getByRole("textbox", {name: /Target/})).toHaveValue(/96/);
    });

    test("an unsupported field still reveals the project's writable fields", async ({page}) => {
        await page.goto("/");
        await page.getByLabel("Another writable field").fill("/paytable/NOPE/3");
        await page.getByRole("button", {name: "Add field"}).click();
        await page.getByRole("button", {name: "Check tuning support"}).click();
        await expect(page.getByText(/Unknown policy path/).first()).toBeVisible({timeout: 30_000});
        await expect(page.getByText("/paytable/NOPE/3", {exact: false}).first()).toBeVisible();
        await expect(page.getByText(/writable fields discovered/)).toBeVisible();
        await expect(page.getByText(/does not list this field as writable/)).toBeVisible();
    });

    test("simulation uses readable precision and stop-reason labels", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Simulation", exact: true}).click();
        await page.getByLabel("Rounds *").fill("1000");
        await page.getByRole("button", {name: "Run Simulation"}).click();
        await expect(page.getByText(/Simulation completed — /)).toBeVisible({timeout: 60_000});
        await expect(page.getByText(/1,000 rounds used · no precision target set/i).first()).toBeVisible();
        await page.getByRole("button", {name: "Open full report"}).click();
        await expect(page.getByRole("rowheader", {name: "Stop reason"})).toBeVisible();
        await expect(page.getByRole("rowheader", {name: "Stop reason"}).locator("xpath=following-sibling::td[1]")).toHaveText(/requested rounds completed/i);
    });

    test("simulation comparison shows the shared design and metric deltas", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Simulation", exact: true}).click();
        const loadedReports = page.getByText(/Loaded \d+ simulation reports?/);
        const reportCount = async (): Promise<number> => {
            const text = await loadedReports.first().textContent();
            return Number(/\d+/.exec(text ?? "")?.[0] ?? 0);
        };
        const run = async (seed: string) => {
            const before = await reportCount();
            await page.getByRole("button", {name: "Change settings", exact: true}).click();
            const advanced = page.getByRole("button", {name: "Show advanced details (seed, workers)"});
            if (await advanced.isVisible().catch(() => false)) {
                await advanced.click();
            }
            await page.getByLabel("Rounds *").fill("1000");
            await page.getByLabel("Seed (optional)").fill(seed);
            await page.getByRole("button", {name: "Run Simulation", exact: true}).click();
            // The list count is a completion receipt for *this* run; a previous report's status text
            // would otherwise satisfy a plain "Simulation completed" wait immediately.
            await expect(page.getByText(new RegExp(`Loaded ${before + 1} simulation reports?`))).toBeVisible({timeout: 60_000});
        };
        await run("compare-a");
        await run("compare-b");
        await page.getByRole("button", {name: "Compare with another run", exact: true}).click();
        await page.getByRole("button", {name: /seed compare-a/}).first().click();
        await expect(page.getByText(/Both runs sampled the same saved design/)).toBeVisible({timeout: 20_000});
        const table = page.getByRole("table", {name: "Simulation comparison metrics"});
        await expect(table).toBeVisible();
        await expect(table.getByRole("row", {name: /RTP/})).toContainText("%");
    });

    test("Play uses singular round wording for a single step and one part", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Play", exact: true}).click();
        const newSession = page.getByRole("button", {name: "New Play session"});
        await expect(newSession).toBeVisible({timeout: 30_000});
        await newSession.click();
        const spin = page.getByRole("button", {name: "Spin", exact: true});
        await expect(spin).toBeVisible({timeout: 60_000});
        await spin.click();
        await expect(page.getByText(/Round completed: 1 step, 1 part/)).toBeVisible({timeout: 30_000});
        await expect(page.getByText(/1 steps/)).toHaveCount(0);
    });

    test("Play keeps paylines and paytable disclosures open while the round updates", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Play", exact: true}).click();
        const newSession = page.getByRole("button", {name: "New Play session"});
        const spin = page.getByRole("button", {name: "Spin", exact: true});
        await expect(newSession.or(spin)).toBeVisible({timeout: 60_000});
        if (await newSession.isVisible()) {
            await newSession.click();
        }
        await expect(spin).toBeVisible({timeout: 60_000});
        await spin.click();
        await expect(page.getByText(/Round completed: 1 step, 1 part/)).toBeVisible({timeout: 30_000});

        const paytable = page.locator("details.player-paytable-details");
        await expect(paytable).toBeVisible();
        await paytable.locator("summary").click();
        await expect(paytable).toHaveJSProperty("open", true);
        await page.waitForTimeout(1500);
        await expect(paytable).toHaveJSProperty("open", true);
        await expect(paytable.getByRole("table")).toContainText("A");

        const lines = page.locator("details.player-lines-details");
        await expect(lines).toBeVisible();
        await lines.locator("summary").click();
        await expect(lines).toHaveJSProperty("open", true);
        await page.waitForTimeout(1500);
        await expect(lines).toHaveJSProperty("open", true);
        await expect(lines).toContainText(/rows/);

        await page.getByRole("button", {name: "Find any win", exact: true}).click();
        await expect(page.getByText(/Round completed: 1 step, 1 part, stake \d+, payout [1-9]/)).toBeVisible({timeout: 30_000});
        await page.locator("summary", {hasText: "Inspect round record"}).click();
        await expect(page.getByRole("columnheader", {name: "Positions (reel:row, 0-based)"})).toBeVisible();
        await expect(page.getByRole("cell", {name: /\d+:\d+/}).first()).toBeVisible();
    });

    test("a completed optimization does not show indeterminate work", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Check tuning support"}).click();
        await expect(page.getByText(/Supported finite same-type workflow/)).toBeVisible({timeout: 30_000});
        await page.getByRole("button", {name: "Run optimization"}).click();
        await expect(page.getByText(/Verdict: (success|attained)/)).toBeVisible({timeout: 60_000});
        await expect(page.getByText(/indeterminate/)).toHaveCount(0);
        await expect(page.getByText(/Finalizing/)).toHaveCount(0);
    });

    test("Overview computes exact math and exposes the complete payout distribution", async ({page}) => {
        await page.goto("/");
        await expect(page.getByRole("heading", {name: "Exact math for this saved design"})).toBeVisible({timeout: 60_000});
        await page.getByRole("button", {name: /^Compute exact math$/}).click();
        await expect(page.getByText(/Exact, not sampled:/)).toBeVisible({timeout: 120_000});
        await page.getByRole("button", {name: /payout distribution/}).click();
        await expect(page.getByRole("table", {name: "Exact payout distribution"})).toBeVisible();
        await page.getByRole("button", {name: /line and symbol contributions/}).click();
        await expect(page.getByRole("table", {name: "Exact line and symbol contributions"}).first()).toBeVisible();
    });

    test("apply asks for confirmation and marks the exact library stale immediately", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Check tuning support"}).click();
        await expect(page.getByText(/Supported finite same-type workflow/)).toBeVisible({timeout: 30_000});
        await page.getByRole("button", {name: "Run optimization"}).click();
        await expect(page.getByText(/Verdict: (success|attained)/)).toBeVisible({timeout: 60_000});
        await expect(page.getByRole("button", {name: "Apply reviewed changes"})).toBeVisible({timeout: 30_000});
        await page.getByRole("button", {name: "Apply reviewed changes"}).click();
        await expect(page.getByRole("dialog")).toContainText("Apply these reviewed changes to the saved design?");
        await page.locator("#optimization-apply-confirm").click();
        await expect(page.getByText("Changes saved to the game design")).toBeVisible({timeout: 60_000});
        // The exact library was computed above from the pre-apply design. Applying a new paytable
        // must not leave those old numbers looking current until a manual reload.
        await expect(page.getByText(/computed from a different saved design/)).toBeVisible({timeout: 30_000});
        await expect(page.getByRole("button", {name: "Recompute exact math"}).first()).toBeVisible();
        await page.getByRole("button", {name: "Undo applied changes"}).click();
        await expect(page.getByText(/Previous design values restored/)).toBeVisible({timeout: 60_000});
    });

    test("a correctly scoped project URL restores the requested tab", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Simulation", exact: true}).click();
        await expect(page.getByText("Simulation ready")).toBeVisible({timeout: 60_000});
        const simulationUrl = page.url();
        expect(simulationUrl).toContain("/simulation");
        await page.goto("about:blank");
        await page.goto(simulationUrl);
        await expect(page.getByText("Simulation ready")).toBeVisible({timeout: 60_000});
        expect(page.url()).toContain("/simulation");
    });
});
