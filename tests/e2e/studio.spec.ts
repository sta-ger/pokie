import {expect, test} from "@playwright/test";

test("Home opens at the top with the design intro visible", async ({page}) => {
    await page.goto("/#/home/design");
    await expect(page.getByRole("heading", {name: "Design Your Game"})).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test("Design Game previews exact math from the draft without saving a project", async ({page}) => {
    await page.goto("/#/home/design");
    await page.getByRole("button", {name: "Calculate exact math"}).click();
    await expect(page.getByText("Exact RTP", {exact: true})).toBeVisible({timeout: 60_000});
    await expect(page.getByText("96.7680%", {exact: true}).first()).toBeVisible();
    await expect(page.getByText(/Draft only — nothing was saved/)).toBeVisible();
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

    test("Game Model shows the effective payline rows without entering edit mode", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Game Model", exact: true}).click();
        await expect(page.getByText("Line 1: 0 → 0 → 0 → 0 → 0")).toBeVisible({timeout: 60_000});
        await expect(page.getByText("Line 2: 1 → 1 → 1 → 1 → 1")).toBeVisible();
        await expect(page.getByText("Line 3: 2 → 2 → 2 → 2 → 2")).toBeVisible();
    });

    test("a negative payout is rejected visibly instead of changing its sign", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Game Model", exact: true}).click();
        await page.getByRole("button", {name: "Edit", exact: true}).nth(4).click();
        const payout = page.getByRole("textbox", {name: "A x3 payout"});
        const original = await payout.inputValue();
        await payout.fill("-5");
        await payout.press("Tab");
        await expect(page.getByText("Payout cannot be negative. The previous value was kept.")).toBeVisible();
        await expect(payout).toHaveValue(original);
        await page.getByRole("button", {name: "Cancel", exact: true}).click();
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
        await expect(page.getByText(/can be tuned/)).toBeVisible();
        await expect(page.getByText(/does not list this field as writable/)).toBeVisible();
    });

    test("simulation uses readable precision and stop-reason labels", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Simulation", exact: true}).click();
        await page.getByLabel("Rounds *").fill("1000");
        await page.getByRole("button", {name: "Run Simulation"}).click();
        await expect(page.getByText(/Simulation completed — /)).toBeVisible({timeout: 60_000});
        await expect(page.getByText(/1,000 rounds used · no precision target set/i).first()).toBeVisible();
        const summary = page.getByRole("table", {name: "Simulation summary"});
        const seedRow = summary.getByRole("rowheader", {name: "Seed"});
        await expect(seedRow).toBeVisible();
        await expect(seedRow.locator("xpath=following-sibling::td[1]")).toHaveText(/^studio-[a-z0-9]+$/);
        await page.getByRole("button", {name: "Open full report"}).click();
        await expect(page.getByRole("rowheader", {name: "Stop reason"})).toBeVisible();
        await expect(page.getByRole("rowheader", {name: "Stop reason"}).locator("xpath=following-sibling::td[1]")).toHaveText(/requested rounds completed/i);
    });

    test("simulation rounds keep grouped thousands instead of silently dropping digits", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Simulation", exact: true}).click();
        const rounds = page.getByLabel("Rounds *");
        const changeSettings = page.getByRole("button", {name: "Change settings", exact: true});
        await expect(rounds.or(changeSettings)).toBeVisible({timeout: 60_000});
        if (await changeSettings.isVisible()) {
            await changeSettings.click();
        }
        await expect(rounds).toBeVisible({timeout: 30_000});
        await rounds.click();
        await rounds.press("Control+A");
        await rounds.pressSequentially("10,000");
        await rounds.press("Tab");
        await expect(rounds).toHaveValue("10,000");
    });

    test("simulation comparison shows the shared design and metric deltas", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Simulation", exact: true}).click();
        const loadedReports = page.getByText(/Loaded \d+ simulation reports?/);
        const reportCount = async (): Promise<number> => {
            const text = await loadedReports.first().textContent();
            return Number((/\d+/).exec(text ?? "")?.[0] ?? 0);
        };
        const run = async (seed: string) => {
            const before = await reportCount();
            await page.getByRole("button", {name: "Change settings", exact: true}).click();
            const advanced = page.getByRole("button", {name: "Show advanced details (workers)"});
            if (await advanced.isVisible().catch(() => false)) {
                await advanced.click();
            }
            await page.getByLabel("Rounds *").fill("1000");
            await page.getByLabel("Seed", {exact: true}).fill(seed);
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
        await expect(page.getByText("No round played yet — Spin to play.")).toBeVisible();
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

    test("Find any win settles at the bet selected in Play", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Play", exact: true}).click();
        const newSession = page.getByRole("button", {name: "New Play session"});
        const spin = page.getByRole("button", {name: "Spin", exact: true});
        await expect(newSession.or(spin)).toBeVisible({timeout: 60_000});
        if (await newSession.isVisible()) {
            await newSession.click();
        }
        await expect(spin).toBeVisible({timeout: 60_000});
        // One plain spin materializes the bet picker; then change the bet and search immediately. The
        // scenario search must carry that selection instead of settling at the session's previous bet.
        await spin.click();
        await expect(page.getByText(/Round completed: 1 step, 1 part/)).toBeVisible({timeout: 30_000});
        await page.getByRole("button", {name: "Select bet 5"}).click();
        await page.getByRole("button", {name: "Find any win", exact: true}).click();
        await expect(page.getByText(/Round completed: 1 step, 1 part, stake 5, payout [1-9]/)).toBeVisible({timeout: 60_000});
        await expect(page.getByText("Bet: 5", {exact: true})).toBeVisible();
    });

    test("a completed optimization does not show indeterminate work", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Check tuning support"}).click();
        await expect(page.getByText(/Supported exact search/)).toBeVisible({timeout: 30_000});
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
        const distribution = page.getByRole("table", {name: "Exact payout distribution"});
        await expect(distribution).toBeVisible();
        // The starter has 16 distinct payouts; the complete table is shown by default, so its rows plus
        // the header add up to 17 and there is no hidden "Show all" remainder to explain away a short sum.
        await expect(distribution.getByRole("row")).toHaveCount(17);
        await expect(page.getByRole("button", {name: (/Show all \d+ payouts/)})).toHaveCount(0);
        await page.getByRole("button", {name: /line and symbol contributions/}).click();
        const contributions = page.getByRole("table", {name: "Exact line and symbol contributions"}).first();
        await expect(contributions).toBeVisible();
        await expect(contributions).toContainText("Line 1");
        await expect(contributions).not.toContainText("Line 0");
        await page.getByRole("button", {name: /win event probabilities/}).click();
        const events = page.getByRole("table", {name: "Exact win event probabilities"});
        await expect(events).toBeVisible();
        await expect(events.getByRole("row", {name: /A × 3/})).toContainText("1.9200%");
    });

    test("apply asks for confirmation and marks the exact library stale immediately", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Check tuning support"}).click();
        await expect(page.getByText(/Supported exact search/)).toBeVisible({timeout: 30_000});
        await page.getByRole("button", {name: "Run optimization"}).click();
        await expect(page.getByText(/Verdict: (success|attained)/)).toBeVisible({timeout: 60_000});
        await expect(page.getByRole("button", {name: "Apply reviewed changes"})).toBeVisible({timeout: 30_000});
        await page.getByRole("button", {name: "Apply reviewed changes"}).click();
        await expect(page.getByRole("dialog")).toContainText("Apply these reviewed changes to the saved design?");
        await page.locator("#optimization-apply-confirm").click();
        await expect(page.getByText("Changes saved to the game design")).toBeVisible({timeout: 60_000});
        // The optimization panel must re-read the saved model after Apply: the Current column should
        // show the newly saved payout without a manual reload.
        const tunedRow = page.getByRole("row", {name: /A × 3 payout/});
        await expect(tunedRow.getByRole("cell").nth(2)).toHaveText("7", {timeout: 30_000});
        // Switching tabs unmounts the optimization panel, not the 15-minute server receipt. Undo must
        // remain available when the designer comes back to inspect the applied values.
        await page.getByRole("button", {name: "Game Model", exact: true}).click();
        await page.getByRole("button", {name: "Overview", exact: true}).click();
        await expect(page.getByRole("button", {name: "Undo applied changes"})).toBeVisible({timeout: 30_000});
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
