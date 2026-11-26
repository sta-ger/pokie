import {expect, test} from "@playwright/test";
import {execFileSync} from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

test("Home opens at the top with the design intro visible", async ({page}) => {
    await page.goto("/#/home/design");
    await expect(page.getByRole("heading", {name: "Design Your Game"})).toBeVisible();
    await expect(page.getByText(/no code needed for those steps/i)).toBeVisible();
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBe(0);
});

test("the guided landing offers the three starting paths before the full form", async ({page}) => {
    await page.goto("/#/home/design");
    await expect(page.getByText("Choose a starting point", {exact: true})).toBeVisible();
    await expect(page.getByRole("button", {name: "Use the starter"})).toBeVisible();
    await expect(page.getByRole("button", {name: "Open PAR import"})).toBeVisible();
    await expect(page.getByRole("button", {name: "Open Projects"})).toBeVisible();
});

test("Create game design stays visible while the starter form scrolls", async ({page}) => {
    await page.goto("/#/home/design");
    const bar = page.locator("[data-pokie-primary-action-bar]");
    await expect(bar).toBeVisible();
    const create = page.getByRole("button", {name: /^(Create game design|Checking design…)$/});
    await expect(create).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 1600));
    await page.waitForTimeout(100);
    const box = await bar.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.y).toBeLessThan(240);
});

test("Use the starter returns the primary Create action into view", async ({page}) => {
    await page.goto("/#/home/design");
    await page.getByRole("button", {name: "Use the starter"}).click();
    await expect(page.getByRole("button", {name: /^(Create game design|Checking design…)$/})).toBeInViewport();
});

test("the mathematical definition comparison is collapsed until asked for", async ({page}) => {
    await page.goto("/#/home/design");
    await expect(page.getByText("Compare mathematical definitions", {exact: true}).first()).toBeVisible();
    await expect(page.getByRole("heading", {name: "Mathematical definition comparison"})).toBeHidden();
});

test("Layout exposes the lines, ways and clusters win model", async ({page}) => {
    await page.goto("/#/home/design");
    await page.getByRole("tab", {name: /Layout/}).click();
    await page.getByRole("combobox").click();
    await page.getByRole("option", {name: /Ways/}).click();
    await expect(page.getByText("Paylines are not used by this win model", {exact: true})).toBeVisible();
    await page.getByRole("combobox").click();
    await page.getByRole("option", {name: /Clusters/}).click();
    await expect(page.getByLabel("Minimum cluster size")).toBeVisible();
});

test("the starter can open directly in ways or clusters mode", async ({page}) => {
    await page.goto("/#/home/design");
    await expect(page.getByRole("button", {name: "Use the starter"})).toBeVisible();
    await page.getByRole("button", {name: "Clusters", exact: true}).click();
    await expect(page.locator('[data-pokie-starter-mode-notice="clusters"]')).toContainText("structural demo");
    await expect(page.locator('[data-pokie-starter-mode-notice="clusters"]')).toContainText("retune the paytable");
    await expect(page.locator('[data-pokie-starter-mode-notice="clusters"]')).toBeInViewport();
    await page.getByRole("tab", {name: /Layout/}).click();
    await expect(page.getByRole("combobox", {name: "Win model"})).toHaveValue("Clusters — connected groups");
    await expect(page.getByLabel("Minimum cluster size")).toBeVisible();
});

test("Glossary opens the bundled local documentation inside Studio", async ({page}) => {
    await page.goto("/#/home/design");
    await page.getByRole("link", {name: "Glossary"}).click();
    await expect(page.getByText("Bundled with this installation", {exact: false})).toBeVisible();
    await expect(page.getByRole("heading", {name: "Glossary"})).toBeVisible();
    await expect(page.getByText(/RTP \(Return to Player\)/)).toBeVisible();
    await expect(page.getByText(/table of every possible outcome of one paid entry spin/)).toBeVisible();
    await expect(page.getByText(/Retrigger factor/)).toBeVisible();
    await expect(page.getByText(/Accepted spin \(API\)/)).toBeVisible();
});

test("Design Game previews exact math from the draft without saving a project", async ({page}) => {
    await page.goto("/#/home/design");
    await page.getByRole("button", {name: "Calculate exact math"}).click();
    await expect(page.getByText("Exact RTP", {exact: true})).toBeVisible({timeout: 60_000});
    await expect(page.getByText("96.7680%", {exact: true}).first()).toBeVisible();
    await expect(page.getByText(/Draft only — nothing was saved/)).toBeVisible();
    await expect(
        page.locator("p").filter({hasText: /can exceed the largest paytable entry when several lines win/}),
    ).toBeVisible();
});

test("a transient validation failure retries once instead of disabling Create permanently", async ({page}) => {
    let failedOnce = false;
    await page.route("**/api/home/blueprints/validate", async (route) => {
        if (!failedOnce) {
            failedOnce = true;
            await route.fulfill({
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({error: "Simulated transient validation failure"}),
            });
            return;
        }
        await route.continue();
    });
    await page.goto("/#/home/design");
    await expect(page.getByRole("button", {name: "Create game design"})).toBeEnabled({timeout: 45_000});
    expect(failedOnce).toBe(true);
});

test("a transient exact-math preview failure retries once", async ({page}) => {
    let failedOnce = false;
    await page.route("**/api/home/blueprints/math-preview", async (route) => {
        if (!failedOnce) {
            failedOnce = true;
            await route.fulfill({
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({error: "Simulated transient exact-math failure"}),
            });
            return;
        }
        await route.continue();
    });
    await page.goto("/#/home/design");
    await page.getByRole("button", {name: "Calculate exact math"}).click();
    await expect(page.getByText("96.7680%", {exact: true}).first()).toBeVisible({timeout: 60_000});
    expect(failedOnce).toBe(true);
});

test("Create game design carries a draft exact-math preview into the saved project", async ({page}) => {
    await page.goto("/#/home/design");
    await page.getByRole("button", {name: "Use the starter"}).click();
    await page.getByLabel("Game id").fill("auto-exact-e2e");
    await page.getByRole("button", {name: "Calculate exact math"}).click();
    await expect(page.getByText("Exact RTP", {exact: true}).first()).toBeVisible({timeout: 60_000});
    await expect(page.getByText(/the project will compute its own exact outcome table/i)).toBeVisible();
    await page.getByRole("button", {name: "Create game design"}).click();
    await expect(page.getByRole("button", {name: "Overview", exact: true})).toBeVisible({timeout: 90_000});
    // The generation progress and the missing-table empty state must never be shown at the same time.
    await expect(page.getByText(/No exact outcome table exists for this saved design yet/)).toHaveCount(0);
    // No second "Compute exact outcome table" click: the saved project continues the draft preview itself.
    await expect(page.getByText("Exact outcome table generated", {exact: false}).first()).toBeVisible({
        timeout: 120_000,
    });
    await expect(page.getByText("96.7680%", {exact: true}).first()).toBeVisible();
});

test("Game design previews exact math from the saved design, not an empty draft", async ({page}) => {
    test.setTimeout(180_000);
    await page.goto("/#/home/design");
    await page.getByRole("button", {name: "Use the starter"}).click();
    await page.getByLabel("Game id").fill("game-model-preview-e2e");
    await page.getByRole("button", {name: "Create game design"}).click();
    await expect(page.getByRole("button", {name: "Overview", exact: true})).toBeVisible({timeout: 90_000});

    await page.getByRole("button", {name: "Game design", exact: true}).click();
    await expect(page.getByText("Exact math preview for the saved design", {exact: true})).toBeVisible();
    await page.getByRole("button", {name: "Calculate exact math", exact: true}).click();

    await expect(page.getByText("96.7680%", {exact: true}).first()).toBeVisible({timeout: 60_000});
    await expect(page.getByText(/must be a non-empty string/)).toHaveCount(0);
    await expect(page.getByText(/must be a non-empty array of non-empty strings/)).toHaveCount(0);
});

test("Build/Export keeps the PAR sheet primary and collapses developer outputs", async ({page}) => {
    test.setTimeout(180_000);
    await page.goto("/#/home/design");
    await page.getByRole("button", {name: "Use the starter"}).click();
    await page.getByLabel("Game id").fill("build-export-e2e");
    await page.getByLabel("Game name").fill("Build Export E2E");
    await expect(page.getByRole("button", {name: "Create game design"})).toBeEnabled({timeout: 60_000});
    await page.getByRole("button", {name: "Create game design"}).click();
    await expect(page.getByRole("button", {name: "Overview", exact: true})).toBeVisible({timeout: 90_000});
    await page.getByRole("button", {name: "Build/Export", exact: true}).click();
    await expect(page.getByText("PAR sheet (.xlsx)", {exact: true}).first()).toBeVisible({timeout: 60_000});
    await expect(page.getByText("TypeScript Game Package", {exact: true}).first()).toBeHidden();
    await expect(page.getByText("Developer outputs", {exact: true})).toBeVisible();
    await page.getByRole("button", {name: "Show Developer outputs details"}).click();
    await expect(page.getByText("TypeScript Game Package", {exact: true}).first()).toBeVisible();
});

test("a completed PAR build stays downloadable after a page reload", async ({page}) => {
    test.setTimeout(240_000);
    await page.goto("/#/home/design");
    await page.getByRole("button", {name: "Use the starter"}).click();
    await page.getByLabel("Game id").fill("build-persist-e2e");
    await page.getByLabel("Game name").fill("Build Persistence E2E");
    await page.getByRole("button", {name: "Create game design"}).click();
    await expect(page.getByRole("button", {name: "Overview", exact: true})).toBeVisible({timeout: 90_000});

    await page.getByRole("button", {name: "Build/Export", exact: true}).click();
    const build = page.getByRole("button", {name: "Build", exact: true}).first();
    await expect(build).toBeEnabled({timeout: 60_000});
    await build.click();
    await expect(page.getByText("Build completed", {exact: true})).toBeVisible({timeout: 120_000});
    await expect(page.getByRole("link", {name: /Download PAR sheet/})).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", {name: "Build/Export", exact: true})).toBeVisible({timeout: 90_000});
    await expect(page.getByText("Existing output", {exact: true})).toBeVisible({timeout: 60_000});
    await expect(page.getByRole("button", {name: /Use a new name|Build current copy/})).toBeVisible();
    await expect(page.getByRole("link", {name: /Download PAR sheet/})).toBeVisible();
    await expect(page.getByText(/This file matches the current saved design|Download serves the existing copy|This output is from an earlier design/)).toBeVisible();
});

test("a transient build-preview failure retries instead of permanently disabling Build", async ({page}) => {
    test.setTimeout(180_000);
    let failedOnce = false;
    await page.route("**/api/project/build/preview", async (route) => {
        let target: unknown;
        try {
            target = (route.request().postDataJSON() as {target?: unknown} | undefined)?.target;
        } catch {
            target = undefined;
        }
        if (target === "parWorkbook" && !failedOnce) {
            failedOnce = true;
            await route.fulfill({
                status: 500,
                contentType: "application/json",
                body: JSON.stringify({error: "Simulated transient build-preview failure"}),
            });
            return;
        }
        await route.continue();
    });
    await page.goto("/#/home/design");
    await page.getByRole("button", {name: "Use the starter"}).click();
    await page.getByLabel("Game id").fill("build-preview-retry-e2e");
    await page.getByRole("button", {name: "Create game design"}).click();
    await expect(page.getByRole("button", {name: "Build/Export", exact: true})).toBeVisible({timeout: 90_000});
    await page.getByRole("button", {name: "Build/Export", exact: true}).click();
    const build = page.getByRole("button", {name: "Build", exact: true}).first();
    await expect(build).toBeEnabled({timeout: 60_000});
    expect(failedOnce).toBe(true);
});

test("Design readiness checklist tracks every section and the remaining math steps", async ({page}) => {
    await page.goto("/#/home/design");
    await expect(page.getByText("Readiness checklist", {exact: true})).toBeVisible();
    await expect(page.locator("[data-pokie-readiness-checklist]")).toHaveAttribute(
        "data-pokie-validation-state",
        "ok",
        {timeout: 45_000},
    );
    await expect(page.getByText("Draft is ready to save", {exact: true})).toBeVisible();
    await expect(page.getByText(/Exact math is optional now\./)).toBeVisible();
    await expect(page.getByText(/Simulation and PAR export come after saving\./)).toBeVisible();
    await page.getByRole("button", {name: "Show readiness checklist details"}).click();

    for (const section of ["basics", "layout", "symbols", "reels", "paytable", "bets", "mechanics"]) {
        await expect(page.locator(`[data-checklist-item="${section}"]`)).toContainText("Ready");
    }
    const exactMath = page.locator('[data-checklist-item="exact-math"]');
    const simulation = page.locator('[data-checklist-item="simulation"]');
    const par = page.locator('[data-checklist-item="par"]');
    await expect(exactMath).toContainText("Optional");
    await expect(exactMath).toContainText("Not calculated yet");
    await expect(simulation).toContainText("After creating the game design");
    await expect(par).toContainText("After creating the game design");

    await page.getByRole("button", {name: "Calculate exact math"}).click();
    await expect(exactMath).toContainText("Ready", {timeout: 60_000});
    await expect(page.getByText("Draft is ready to save", {exact: true})).toBeVisible();
});

test("the slot-math primer explains exact vs sampled and the math-review path", async ({page}) => {
    await page.goto("/#/home/design");
    await page.getByText(/How this works/).click();
    await page.getByText(/New to slot math\?/).click();
    await expect(page.getByText(/Exact math enumerates every outcome/)).toBeVisible();
    await expect(page.getByText(/Studio never presents a sample as exact/)).toBeVisible();
    await expect(page.getByText(/No code needed/)).toBeVisible();
    await expect(page.getByText("PAR sheet (.xlsx)", {exact: true})).toBeVisible();
});

test("free games asks for a scatter symbol before adding the mechanic", async ({page}) => {
    await page.goto("/#/home/design");
    await page.getByRole("tab", {name: /Mechanics/}).click();
    await expect(page.getByText("Add a scatter symbol first")).toBeVisible();
    await expect(page.getByRole("button", {name: "Add free games"})).toBeDisabled();
});

test("free games guides scatter placement and the mechanic setup in one step", async ({page}) => {
    await page.goto("/#/home/design");
    await page.getByRole("tab", {name: /Mechanics/}).click();
    await page.getByRole("button", {name: "Set up scatter + free games"}).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.getByText("Set up scatter + free games")).toBeVisible();
    await expect(dialog.getByLabel("New scatter symbol id")).toHaveValue("S");
    await expect(
        dialog.getByRole("checkbox", {name: "Use 10-stop demo reels on the scatter reels"}),
    ).toBeChecked();
    await expect(dialog.getByText(/Trigger probability: 2\.7000%/)).toBeVisible();
    await dialog.getByRole("button", {name: "Calculate exact RTP for this setup"}).click();
    await expect(dialog.getByText(/Total RTP/)).toBeVisible({timeout: 120_000});
    await expect(dialog.getByText(/free games\./)).toBeVisible();
    await expect(dialog.getByText(/Max whole-round win: unbounded without a cap/)).toBeVisible();
    await dialog.getByRole("button", {name: "Add scatter and free games"}).click();
    await expect(page.getByLabel("3 scatters free games awarded")).toHaveValue("10");
    await expect(page.getByLabel("4 scatters free games awarded")).toHaveValue("15");
    await expect(page.getByLabel("5 scatters free games awarded")).toHaveValue("20");
    await expect(page.getByText("Scatter symbol")).toBeVisible();
});

test("free games wizard offers a cap for a supercritical setup and blocks Add while exact math runs", async ({
    page,
}) => {
    test.setTimeout(120_000);
    await page.route("**/api/home/blueprints/math-preview", async (route) => {
        await new Promise<void>((resolve) => {
            setTimeout(resolve, 1500);
        });
        await route.continue();
    });
    await page.goto("/#/home/design");
    await page.getByRole("tab", {name: /Mechanics/}).click();
    await page.getByRole("button", {name: "Set up scatter + free games"}).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("checkbox", {name: "Use 10-stop demo reels on the scatter reels"}).uncheck();
    await dialog.getByLabel("3 scatters free games awarded").fill("10");
    await dialog.getByLabel("4 scatters free games awarded").fill("15");
    await dialog.getByLabel("5 scatters free games awarded").fill("25");
    await expect(dialog.getByText(/set a maximum free-games cap below/)).toBeVisible();
    const add = dialog.getByRole("button", {name: "Add scatter and free games"});
    await expect(add).toBeDisabled();

    await dialog.getByRole("button", {name: "Use a 50-free-game cap"}).click();
    await expect(dialog.getByLabel("Maximum free games per feature")).toHaveValue("50");
    await expect(add).toBeEnabled();
    await dialog.getByRole("button", {name: "Calculate exact RTP for this setup"}).click();
    await expect(add).toBeDisabled();
    await expect(dialog.getByText(/Total RTP/)).toBeVisible({timeout: 60_000});
    await expect(dialog.getByText(/upper bound with cap/)).toBeVisible();
    await expect(add).toBeEnabled();

    await add.click();
    await expect(page.getByLabel("3 scatters free games awarded")).toHaveValue("10");
    await expect(page.getByLabel("Maximum free games per feature")).toHaveValue("50");
});

test("free games starts with exact 3/4/5 scatter awards and explains that unlisted counts award zero", async ({
    page,
}) => {
    await page.goto("/#/home/design");
    await page.getByRole("tab", {name: /Symbols/}).click();
    await page.getByRole("textbox", {name: "New symbol id"}).fill("S");
    await page.getByRole("button", {name: "Add symbol"}).click();
    await page.getByRole("checkbox", {name: "Symbol 5 is scatter"}).check();
    await page.getByRole("tab", {name: /Mechanics/}).click();
    await page.getByRole("button", {name: "Add free games"}).click();

    await expect(page.getByText(/Each row is an exact scatter count/)).toBeVisible();
    await expect(page.getByLabel("3 scatters free games awarded")).toHaveValue("10");
    await expect(page.getByLabel("4 scatters free games awarded")).toHaveValue("15");
    await expect(page.getByLabel("5 scatters free games awarded")).toHaveValue("20");
});

test("marking a paying symbol as a scatter warns that it pays anywhere", async ({page}) => {
    await page.goto("/#/home/design");
    await page.getByRole("tab", {name: /Symbols/}).click();
    await page.getByRole("checkbox", {name: "Symbol 3 is scatter"}).check();

    await expect(page.getByText("Scatter pays anywhere", {exact: true})).toBeVisible();
    await expect(page.getByText(/Q is also in the paytable/)).toBeVisible();
});

test("a duplicate symbol rename is rejected visibly and keeps the persisted id", async ({page}) => {
    await page.goto("/#/home/design");
    await page.getByRole("tab", {name: /Symbols/}).click();
    const symbolOne = page.getByRole("textbox", {name: "Symbol 1 id"});
    await symbolOne.fill("K");
    await symbolOne.press("Tab");
    await expect(
        page.getByRole("alert").filter({hasText: 'Cannot rename "A" to "K": that symbol id already exists.'}).first(),
    ).toBeVisible();
    await expect(page.getByRole("textbox", {name: "Symbol 1 id"})).toHaveValue("A");
});

test("the advanced file controls explain that they are not the managed project location", async ({page}) => {
    await page.goto("/#/home/design");
    await page.getByRole("button", {name: /advanced options/}).click();
    await expect(page.getByText(/These are file tools for a game design JSON copy/)).toBeVisible();
});

test("a generated structural template is previewed before it replaces the draft", async ({page}) => {
    await page.goto("/#/home/design");
    await expect(page.getByText(/Keep the terminal window that started it open/)).toBeVisible();
    await page.getByRole("button", {name: "Choose a different start"}).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByRole("button", {name: "Generate a structural template"}).click();
    await dialog.getByRole("button", {name: "Generate"}).click();
    await expect(dialog.getByText(/Generated “/)).toBeVisible({timeout: 60_000});
    await expect(dialog.getByText("Board", {exact: true})).toBeVisible();
    await expect(dialog.getByText("Features", {exact: true})).toBeVisible();
    await expect(dialog.getByText(/RTP is not tuned yet/)).toBeVisible();
});

test("an interrupted project opening appears under Needs attention, not Active jobs", async ({page}) => {
    const job = {
        id: "recovery-job-1",
        projectId: "/tmp/recovered-game.blueprint.json",
        operation: "project-open-materialization",
        request: {sourcePath: "/tmp/recovered-game.blueprint.json"},
        conflictKey: "project-open:/tmp/recovered-game.blueprint.json",
        status: "recovery-required",
        createdAt: 1,
        completedAt: 2,
        durationMs: 1,
        recovery: {action: "retry", reason: "Project preparation is not resumable after restart. Reopen the same project to retry."},
    };
    let jobPresent = true;
    await page.route("**/api/home/jobs**", (route) => {
        if (route.request().method() === "POST" && route.request().url().endsWith("/dismiss")) {
            jobPresent = false;
            return route.fulfill({
                status: 200,
                contentType: "application/json",
                body: JSON.stringify({dismissed: true, id: job.id}),
            });
        }
        return route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({jobs: jobPresent ? [job] : []}),
        });
    });
    await page.goto("/#/home/design");
    await expect(page.getByRole("heading", {name: "Needs attention"})).toBeVisible({timeout: 30_000});
    await expect(page.getByRole("button", {name: "Retry", exact: true})).toBeVisible();
    await expect(page.getByText(/Studio restarted before this operation finished/).first()).toBeVisible();
    await expect(page.getByRole("heading", {name: "Active jobs"})).toHaveCount(0);
    await page.getByRole("button", {name: "Dismiss", exact: true}).click();
    await expect(page.getByRole("heading", {name: "Needs attention"})).toHaveCount(0);
});

test("multiple historical failed openings collapse into one reviewable group", async ({page}) => {
    const jobs = [1, 2].map((index) => ({
        id: `recovery-group-${index}`,
        projectId: `/tmp/recovered-game-${index}.blueprint.json`,
        operation: "project-open-materialization",
        request: {sourcePath: `/tmp/recovered-game-${index}.blueprint.json`},
        conflictKey: `project-open:/tmp/recovered-game-${index}.blueprint.json`,
        status: "recovery-required",
        createdAt: index,
        completedAt: index + 1,
        durationMs: 1,
        recovery: {action: "retry", reason: "Project preparation is not resumable after restart. Reopen the same project to retry."},
    }));
    let present = true;
    await page.route("**/api/home/jobs**", (route) => {
        if (route.request().method() === "POST" && route.request().url().endsWith("/dismiss")) {
            present = false;
            return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({dismissed: true})});
        }
        return route.fulfill({status: 200, contentType: "application/json", body: JSON.stringify({jobs: present ? jobs : []})});
    });
    await page.goto("/#/home/design");
    const summary = page.locator("[data-pokie-home-attention-summary]");
    await expect(summary).toContainText("2 earlier operations need attention", {timeout: 30_000});
    // The point of the group is that the cards are not an immediate wall of red. They stay available
    // behind one explicit review action.
    await expect(page.locator("[data-pokie-lifecycle-result='project-open-materialization']")).toHaveCount(0);
    await summary.getByRole("button", {name: "Review 2"}).click();
    await expect(page.locator("[data-pokie-lifecycle-result='project-open-materialization']")).toHaveCount(2);
    await summary.getByRole("button", {name: "Dismiss all"}).click();
    await expect(page.getByRole("heading", {name: "Needs attention"})).toHaveCount(0);
});

test.describe.serial("managed project labels", () => {
    test("creates the starter project through the browser", async ({page}) => {
        await page.goto("/#/home/design");
        const create = page.getByRole("button", {name: "Create game design"});
        await expect(create).toBeEnabled({timeout: 45_000});
        await create.click();
        await expect(page.getByRole("button", {name: "Overview", exact: true})).toBeVisible({timeout: 90_000});
    });

    test("a second Create game design with the same Game id is refused visibly", async ({page}) => {
        await page.goto("/#/home/design");
        const create = page.getByRole("button", {name: "Create game design"});
        await expect(create).toBeEnabled({timeout: 45_000});
        await create.click();
        await expect(page.getByText("Game id already in use")).toBeVisible({timeout: 30_000});
        const openExisting = page.getByRole("button", {name: "Open existing project"});
        await expect(openExisting).toBeVisible();
        await openExisting.click();
        await expect(page.getByRole("button", {name: "Overview", exact: true})).toBeVisible({timeout: 90_000});
    });

    test("a colliding starter offers a unique Game id in the field", async ({page}) => {
        await page.goto("/#/home/design");
        const create = page.getByRole("button", {name: "Create game design"});
        await expect(create).toBeEnabled({timeout: 45_000});
        await create.click();
        const useSuggested = page.getByRole("button", {name: "Use starter-slot-2"});
        await expect(useSuggested).toBeVisible({timeout: 30_000});
        await useSuggested.click();
        // The editor switches to Game basics and focuses the field; the next Create is no longer a
        // collision. This test stops before saving so the serial fixture remains a single project.
        await expect(page.getByRole("textbox", {name: "Game id"})).toHaveValue("starter-slot-2");
        await expect(page.getByText("That Game id is already taken.")).toHaveCount(0);
    });

    test("editing a colliding Game id clears the stale collision message", async ({page}) => {
        await page.goto("/#/home/design");
        const create = page.getByRole("button", {name: "Create game design"});
        await expect(create).toBeEnabled({timeout: 45_000});
        await create.click();
        await expect(page.getByText("Game id already in use")).toBeVisible({timeout: 30_000});
        await page.getByRole("textbox", {name: "Game id"}).fill("starter-slot-manual");
        await expect(page.getByText("Game id already in use")).toHaveCount(0);
        await expect(page.getByText("That Game id is already taken.")).toHaveCount(0);
    });

    test("Game design shows the effective payline rows 1-based without entering edit mode", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Game design", exact: true}).click();
        await expect(page.getByText("Payline 1: 1 → 1 → 1 → 1 → 1")).toBeVisible({timeout: 60_000});
        await expect(page.getByText("Payline 2: 2 → 2 → 2 → 2 → 2")).toBeVisible();
        await expect(page.getByText("Payline 3: 3 → 3 → 3 → 3 → 3")).toBeVisible();
    });

    test("a negative payout is rejected visibly instead of changing its sign", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Game design", exact: true}).click();
        await page.getByRole("button", {name: "Edit", exact: true}).nth(4).click();
        const payout = page.getByRole("textbox", {name: "A, 3 symbols payout"});
        const original = await payout.inputValue();
        await payout.fill("-5");
        await payout.press("Tab");
        await expect(page.getByText("Payout cannot be negative. The previous value was kept.")).toBeVisible();
        await expect(payout).toHaveValue(original);
        await page.getByRole("button", {name: "Cancel", exact: true}).click();
    });

    test("a zero payout is saved only after a visible warning", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Game design", exact: true}).click();
        await page.getByRole("button", {name: "Edit", exact: true}).nth(4).click();
        const payout = page.getByRole("textbox", {name: "A, 3 symbols payout"});
        await payout.fill("0");
        await payout.press("Tab");
        await expect(page.getByText(/A zero payout disables this win/)).toBeVisible();
        await page.getByRole("button", {name: "Cancel", exact: true}).click();
    });

    test("exact math preview clears immediately when a paytable payout changes", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Game design", exact: true}).click();
        await page.getByRole("button", {name: "Edit", exact: true}).nth(4).click();
        await page.getByRole("button", {name: "Calculate exact math"}).click();
        await expect(page.getByText("96.7680%", {exact: true}).first()).toBeVisible({timeout: 60_000});

        const payout = page.getByRole("textbox", {name: "A, 3 symbols payout"});
        // Intentionally do not blur: a visible payout must not leave the old exact result looking
        // current while the new value is still waiting for focus to leave the field.
        await payout.fill("10");
        await expect(page.getByText("Exact RTP", {exact: true})).toHaveCount(0);

        await page.getByRole("button", {name: "Calculate exact math"}).click();
        await expect(page.getByText("100.6080%", {exact: true}).first()).toBeVisible({timeout: 60_000});
        await page.getByRole("button", {name: "Cancel", exact: true}).click();
    });

    test("optimization exposes a target and tunable fields without opening JSON", async ({page}) => {
        await page.goto("/");
        await expect(page.getByText("Math target", {exact: true})).toBeVisible({timeout: 60_000});
        await expect(page.getByRole("combobox", {name: "Metric"})).toBeVisible();
        await expect(page.getByText("Fields to tune", {exact: true})).toBeVisible();
        await page.getByRole("button", {name: "Show Fields to tune details"}).click();
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
        await page.getByRole("button", {name: "Show Fields to tune details"}).click();
        await page.getByLabel("Advanced field path (optional)").fill("/paytable/NOPE/3");
        await page.getByRole("button", {name: "Add field"}).click();
        await page.getByRole("button", {name: "Check settings"}).click();
        await expect(page.getByText(/Unknown policy path/).first()).toBeVisible({timeout: 30_000});
        await expect(page.getByText("/paytable/NOPE/3", {exact: false}).first()).toBeVisible();
        await expect(page.getByText(/writable field/)).toBeVisible();
        await expect(page.getByText(/does not list this field as writable/)).toBeVisible();
    });

    test("simulation uses readable precision and stop-reason labels", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Simulation", exact: true}).click();
        await page.getByLabel(/^Spins \(paid \+ free\)/).fill("1000");
        await page.getByRole("button", {name: "Run Simulation"}).click();
        await expect(page.getByText(/Simulation completed — /)).toBeVisible({timeout: 60_000});
        await expect(page.getByText(/1,000 paid rounds completed · no precision target requested/i).first()).toBeVisible();
        const summary = page.getByRole("table", {name: "Simulation summary"});
        const seedRow = summary.getByRole("rowheader", {name: "Seed"});
        await expect(seedRow).toBeVisible();
        await expect(seedRow.locator("xpath=following-sibling::td[1]")).toHaveText(/^studio-[a-z0-9]+$/);
        await expect(page.getByText(/paid rounds are needed for a ±1 pp interval/).first()).toBeVisible();
        await page.getByRole("button", {name: "Open full report"}).click();
        await expect(page.getByRole("rowheader", {name: "Stop reason"})).toBeVisible();
        await expect(
            page.getByRole("rowheader", {name: "Stop reason"}).locator("xpath=following-sibling::td[1]"),
        ).toHaveText(/requested spins completed/i);
        await expect(page.getByRole("region", {name: "Payout distribution chart"})).toBeVisible();

        // A completed adaptive report carries result-only fields alongside its stop policy. Reusing
        // that policy with a new budget must send only the four server-accepted fields; before this
        // regression check the UI forwarded the whole object and the server rejected it with
        // `Unknown "convergence" option.` instead of starting a second run.
        const loadedReports = page.getByText(/Loaded \d+ simulation reports?/);
        const reportCount = async (): Promise<number> => {
            const text = await loadedReports.first().textContent();
            return Number((/\d+/).exec(text ?? "")?.[0] ?? 0);
        };
        await page.getByRole("button", {name: "Change settings", exact: true}).click();
        await page.getByLabel(/^Spins \(paid \+ free\)/).fill("1000");
        await page.getByLabel(/Target precision/).fill("0.1");
        const beforeAdaptive = await reportCount();
        await page.getByRole("button", {name: "Run Simulation", exact: true}).click();
        await expect(page.getByText(new RegExp(`Loaded ${beforeAdaptive + 1} simulation reports?`))).toBeVisible({
            timeout: 60_000,
        });

        await page.getByRole("button", {name: "Change settings", exact: true}).click();
        await page.getByLabel(/^Spins \(paid \+ free\)/).fill("2000");
        await expect(page.getByLabel(/Target precision/)).toHaveValue("");
        const beforeReuse = await reportCount();
        await page.getByRole("button", {name: "Run Simulation", exact: true}).click();
        await expect(page.getByText(new RegExp(`Loaded ${beforeReuse + 1} simulation reports?`))).toBeVisible({
            timeout: 60_000,
        });
        await expect(page.getByText(/was rejected because a setting is invalid/i)).toHaveCount(0);

        // Export must be a visible action on Review, not only a muted stepper step.
        await page.getByRole("button", {name: "Export report", exact: true}).click();
        await expect(page.getByRole("link", {name: "Download JSON"})).toBeVisible();
        await expect(page.getByRole("link", {name: "Download Markdown"})).toBeVisible();
        await expect(page.getByRole("link", {name: "Download HTML"})).toBeVisible();

    });

    test("simulation rounds keep grouped thousands instead of silently dropping digits", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Simulation", exact: true}).click();
        const rounds = page.getByLabel(/^Spins \(paid \+ free\)/);
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
            await page.getByLabel(/^Spins \(paid \+ free\)/).fill("1000");
            await page.getByLabel("Seed", {exact: true}).fill(seed);
            await page.getByRole("button", {name: "Run Simulation", exact: true}).click();
            // The list count is a completion receipt for *this* run; a previous report's status text
            // would otherwise satisfy a plain "Simulation completed" wait immediately.
            await expect(page.getByText(new RegExp(`Loaded ${before + 1} simulation reports?`))).toBeVisible({
                timeout: 60_000,
            });
        };
        await run("compare-a");
        await run("compare-b");
        await page.getByRole("button", {name: "Compare with another run", exact: true}).click();
        await page
            .getByRole("button", {name: /seed compare-a/})
            .first()
            .click();
        await expect(page.getByText(/Both runs sampled the same saved design/)).toBeVisible({timeout: 20_000});
        const table = page.getByRole("table", {name: "Simulation comparison metrics"});
        await expect(table).toBeVisible();
        await expect(table.getByRole("row", {name: /RTP/})).toContainText("%");
    });

    test("Play uses singular round wording for a single spin and one screen", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Play", exact: true}).click();
        const newSession = page.getByRole("button", {name: "Start playing"});
        await expect(newSession).toBeVisible({timeout: 30_000});
        await newSession.click();
        const spin = page.getByRole("button", {name: "Spin", exact: true});
        await expect(spin).toBeVisible({timeout: 60_000});
        await expect(page.getByText(/up to 2,000 spins/)).toBeVisible();
        await expect(page.getByText(/Every paid spin is charged to Play credits/)).toBeVisible();
        await expect(page.getByText(/No round played yet — this is the session/)).toBeVisible();
        await spin.click();
        await expect(page.getByText(/This paid round is complete: 1 spin, 1 screen/)).toBeVisible({timeout: 30_000});
        await expect(page.getByText("Bet: 1", {exact: true})).toBeVisible();
        await expect(page.getByText(/1 steps/)).toHaveCount(0);
    });

    test("Play keeps paylines and paytable disclosures open while the round updates", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Play", exact: true}).click();
        const newSession = page.getByRole("button", {name: "Start playing"});
        const spin = page.getByRole("button", {name: "Spin", exact: true});
        await expect(newSession.or(spin)).toBeVisible({timeout: 60_000});
        if (await newSession.isVisible()) {
            await newSession.click();
        }
        await expect(spin).toBeVisible({timeout: 60_000});
        await spin.click();
        await expect(page.getByText(/This paid round is complete: 1 spin, 1 screen/)).toBeVisible({timeout: 30_000});

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
        await expect(
            page.getByText(/This paid round is complete: 1 spin, 1 screen; total stake \d+, total payout [1-9]/),
        ).toBeVisible({timeout: 30_000});
        const scenarioSummary = page.locator("[data-pokie-scenario-summary]");
        await expect(scenarioSummary).toContainText(/Searched \d+ spins?/);
        await expect(scenarioSummary).toContainText(/found/i);
        await page.locator("summary", {hasText: "Inspect round record"}).click();
        await expect(page.getByRole("columnheader", {name: "Positions (reel:row, 1-based)"})).toBeVisible();
        await expect(page.getByRole("cell", {name: /\d+:\d+/}).first()).toBeVisible();
    });

    test("opening a recorded Play spin for replay does not crash without a seed", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Play", exact: true}).click();

        // Start from a fresh, deliberately unseeded session: this is the default Play path that used
        // to feed a null seed into the replay inspector and crash on `.trim()`.
        const findAnyWin = page.getByRole("button", {name: "Find any win", exact: true});
        const start = page.getByRole("button", {name: "Start playing"});
        await expect(start.or(findAnyWin)).toBeVisible({timeout: 60_000});
        if (await start.isVisible()) await start.click();
        await expect(findAnyWin).toBeVisible({timeout: 60_000});
        await findAnyWin.click();
        await expect(page.getByText(/This paid round is complete/).first()).toBeVisible({timeout: 60_000});

        await page.getByRole("button", {name: "Replay", exact: true}).click();
        await page.getByText("Played rounds", {exact: true}).click();
        const sessionSpin = page.getByRole("button", {name: /Session \d+ — Spin \d+/}).first();
        await expect(sessionSpin).toBeVisible({timeout: 30_000});
        await expect(page.getByRole("checkbox", {name: "Only winning spins"})).toBeVisible();
        await sessionSpin.click();

        // Selecting a spin must take the reader to its inspector instead of leaving it below the whole list.
        await expect(page.locator("[data-pokie-spin-inspector]")).toBeInViewport({timeout: 15_000});
        await expect(page.getByRole("button", {name: "Back to played rounds"})).toBeVisible();
        const openRecord = page.getByRole("button", {name: "Replay recorded round"});
        await expect(openRecord).toBeVisible({timeout: 30_000});
        await openRecord.click();

        await expect(page.getByText("Loaded replay")).toBeVisible({timeout: 30_000});
        await expect(page.getByText("Unexpected Application Error!")).toHaveCount(0);
    });

    test("Find any win settles at the bet selected in Play", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Play", exact: true}).click();
        const newSession = page.getByRole("button", {name: "Start playing"});
        const spin = page.getByRole("button", {name: "Spin", exact: true});
        await expect(newSession.or(spin)).toBeVisible({timeout: 60_000});
        if (await newSession.isVisible()) {
            await newSession.click();
        }
        await expect(spin).toBeVisible({timeout: 60_000});
        await expect(page.getByRole("combobox", {name: "Round playback"})).toBeVisible();
        // The session's starting credits and real bet list are visible before the first spin. The
        // scenario search must carry that selection instead of settling at a hidden default bet.
        await expect(page.getByText("Credits", {exact: true})).toBeVisible();
        await expect(page.getByText(/^Bet: /)).toBeVisible();
        await page.getByRole("button", {name: "Select bet 5"}).click();
        await page.getByRole("button", {name: "Find any win", exact: true}).click();
        await expect(
            page.getByText(/This paid round is complete: 1 spin, 1 screen; total stake 5, total payout [1-9]/),
        ).toBeVisible({timeout: 60_000});
        await expect(page.getByText("Bet: 5", {exact: true})).toBeVisible();
    });

    test("a completed optimization does not show indeterminate work", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Check settings"}).click();
        await expect(page.getByText(/Supported exact search/)).toBeVisible({timeout: 30_000});
        await page.getByRole("button", {name: "Run optimization"}).click();
        // The starter's default 95% target is deliberately infeasible against its candidates; what
        // this test owns is that the search reaches a reviewed terminal verdict without leaving a
        // permanent indeterminate/Finalizing receipt behind.
        await expect(page.getByText(/Completed — review the verdict below/)).toBeVisible({timeout: 240_000});
        await expect(page.getByText(/Verdict:/)).toBeVisible();
        await expect(page.getByText(/indeterminate/)).toHaveCount(0);
        await expect(page.getByText(/Finalizing/)).toHaveCount(0);
    });

    test("clearing the last optimization field keeps the form usable and explains the constraint", async ({page}) => {
        test.setTimeout(180_000);
        await page.goto("/#/home/design");
        await page.getByRole("button", {name: "Use the starter"}).click();
        await page.getByLabel("Game id").fill("optimizer-last-field-e2e");
        await page.getByLabel("Game name").fill("Optimizer Last Field E2E");
        await expect(page.getByRole("button", {name: "Create game design"})).toBeEnabled({timeout: 60_000});
        await page.getByRole("button", {name: "Create game design"}).click();
        await expect(page.getByRole("button", {name: "Overview", exact: true})).toBeVisible({timeout: 90_000});
        await page.getByRole("button", {name: "Show Fields to tune details"}).click();
        const tuneA3 = page.getByLabel("Tune A, 3 symbols payout");
        await expect(tuneA3).toBeChecked();
        await tuneA3.click();
        await expect(tuneA3).toBeChecked();
        await expect(page.getByText(/Keep at least one field selected/)).toBeVisible();
        await expect(page.getByText("Policy JSON is invalid", {exact: true})).toHaveCount(0);
        await expect(page.getByRole("button", {name: "Run optimization"})).toBeEnabled({timeout: 30_000});

        // This test creates a second project. The serial suite's later tests deliberately operate on
        // the starter project it created earlier, so return to that project before finishing.
        await page.goto("/#/home/projects");
        const starterRow = page.getByRole("row", {name: /starter-slot\/blueprint\.json/});
        await expect(starterRow).toBeVisible({timeout: 60_000});
        await starterRow.getByRole("button", {name: "Open"}).click();
        await expect(page.getByRole("button", {name: "Overview", exact: true})).toBeVisible({timeout: 90_000});
    });

    test("Overview computes exact math and exposes the complete payout distribution", async ({page}) => {
        await page.goto("/");
        await expect(page.getByRole("heading", {name: "Exact math for this saved design"})).toBeVisible({
            timeout: 60_000,
        });
        await page.getByRole("button", {name: /^Compute exact outcome table$/}).click();
        await expect.poll(() => page.getByText(/outcome records/).count(), {timeout: 30_000}).toBeGreaterThan(1);
        await expect(page.getByText(/unknown outcome records/)).toHaveCount(0);
        await expect(page.getByRole("button", {name: "Show all exact math figures", exact: true})).toBeVisible({timeout: 120_000});
        await expect(page.getByText(/not as low, medium or high/)).toBeVisible();
        await page.getByRole("button", {name: "Show all exact math figures", exact: true}).click();
        await expect(page.getByText(/Exact enumeration of/)).toBeVisible();
        await expect(page.getByText(/Outcome table starter-slot/)).toBeVisible();
        await page.getByRole("button", {name: /payout distribution/}).click();
        const distribution = page.getByRole("table", {name: "Exact payout distribution"});
        await expect(distribution).toBeVisible();
        // The starter has 16 distinct payouts; the complete table is shown by default, so its rows plus
        // the header add up to 17 and there is no hidden "Show all" remainder to explain away a short sum.
        await expect(distribution.getByRole("row")).toHaveCount(17);
        await expect(page.getByRole("button", {name: /Show all \d+ payouts/})).toHaveCount(0);
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
        // Exact optimization evaluates several complete outcome sets; leave a generous bound for a
        // loaded CI host while still failing a genuinely stuck job.
        test.setTimeout(360_000);
        await page.goto("/");
        await page.getByRole("button", {name: "Check settings"}).click();
        await expect(page.getByText(/Supported exact search/)).toBeVisible({timeout: 30_000});
        await page.getByRole("button", {name: "Run optimization"}).click();
        await expect(page.getByText(/Verdict: (success|attained)/)).toBeVisible({timeout: 60_000});
        await expect(page.getByRole("button", {name: "Apply reviewed changes"})).toBeVisible({timeout: 30_000});
        await page.getByRole("button", {name: "Apply reviewed changes"}).click();
        await expect(page.getByRole("dialog")).toContainText("Apply these reviewed changes to the saved design?");
        await page.locator("#optimization-apply-confirm").click();
        await expect(page.getByText(/Applied — changes saved to the game design/)).toBeVisible({timeout: 60_000});
        await expect(page.getByText("Portable pre-apply backup", {exact: true})).toBeVisible({timeout: 30_000});
        await expect(page.getByRole("button", {name: "Download pre-apply backup"})).toBeVisible();
        const backupDownload = page.waitForEvent("download");
        await page.getByRole("button", {name: "Download pre-apply backup"}).click();
        const download = await backupDownload;
        expect(download.suggestedFilename()).toMatch(/^optimization-.*\.json$/);
        // The optimization panel must re-read the saved model after Apply: the Current column should
        // show the newly saved payout without a manual reload.
        const tunedRow = page.getByRole("row", {name: /A, 3 symbols payout/});
        await expect(tunedRow.getByRole("cell").nth(2)).toHaveText("7", {timeout: 30_000});
        // Switching tabs unmounts the optimization panel, not the 15-minute server receipt. Undo must
        // remain available when the designer comes back to inspect the applied values.
        await page.getByRole("button", {name: "Game design", exact: true}).click();
        // The exact table is stale after Apply; Game design itself must say so instead of making the
        // author discover it only after switching back to Overview.
        await expect(page.locator("[data-pokie-game-model-exact-stale]")).toBeVisible({timeout: 30_000});
        await page.getByRole("button", {name: "Overview", exact: true}).click();
        await expect(page.getByRole("button", {name: "Undo applied changes"})).toBeVisible({timeout: 30_000});
        // The exact library was computed above from the pre-apply design. Applying a new paytable
        // must not leave those old numbers looking current until a manual reload.
        await expect(page.getByText(/computed from a different saved design/)).toBeVisible({timeout: 30_000});
        await expect(page.getByRole("button", {name: "Recompute exact outcome table"}).first()).toBeVisible();
        // The reviewed-apply receipt is browser-persisted, not tab-session-only: a reload must still
        // offer the 15-minute Undo rather than losing the escape hatch.
        await page.reload({waitUntil: "domcontentloaded"});
        await expect(page.getByRole("button", {name: "Undo applied changes"})).toBeVisible({timeout: 60_000});
        await page.getByRole("button", {name: "Undo applied changes"}).click();
        await expect(page.getByText(/Previous design values restored/)).toBeVisible({timeout: 60_000});
    });

    test("a correctly scoped project URL restores the requested tab", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Simulation", exact: true}).click();
        await expect(page.getByText("Simulation workspace")).toBeVisible({timeout: 60_000});
        const simulationUrl = page.url();
        expect(simulationUrl).toContain("/simulation");
        await page.goto("about:blank");
        await page.goto(simulationUrl);
        await expect(page.getByText("Simulation workspace")).toBeVisible({timeout: 60_000});
        expect(page.url()).toContain("/simulation");
    });

    test("saving a paytable edit refreshes Overview validation without a reload", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Game design", exact: true}).click();
        await page.getByRole("button", {name: "Edit", exact: true}).nth(4).click();
        const payout = page.getByRole("textbox", {name: "A, 5 symbols payout"});
        await payout.fill("40");
        await payout.press("Tab");
        await page.getByRole("button", {name: "Save", exact: true}).click();
        await expect(page.getByRole("button", {name: "Save", exact: true})).toHaveCount(0, {timeout: 60_000});
        await page.getByRole("button", {name: "Overview", exact: true}).click();
        // The saved file now has A, 5 symbols = 40. Overview must report that warning from the fresh save,
        // not the pre-save validation result and not only after a page reload.
        await expect(page.getByText(/Structure valid, with warnings/)).toBeVisible({timeout: 30_000});
        await expect(page.getByText(/"A" pays more than "K"/)).toBeVisible({timeout: 30_000});

        await page.getByRole("button", {name: "Game design", exact: true}).click();
        await page.getByRole("button", {name: "Edit", exact: true}).nth(4).click();
        await page.getByRole("textbox", {name: "A, 5 symbols payout"}).fill("32");
        await page.getByRole("textbox", {name: "A, 5 symbols payout"}).press("Tab");
        await page.getByRole("button", {name: "Save", exact: true}).click();
        await expect(page.getByRole("button", {name: "Save", exact: true})).toHaveCount(0, {timeout: 60_000});
        await page.getByRole("button", {name: "Overview", exact: true}).click();
        await expect(page.getByText(/Structure valid — (no exact outcome table yet|exact outcome table is stale|exact outcome table available)/)).toBeVisible({timeout: 30_000});
    });

    test("saving a design resets a Play session created from the old design", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Play", exact: true}).click();
        const start = page.getByRole("button", {name: "Start playing"});
        await expect(start).toBeVisible({timeout: 60_000});
        await start.click();
        const spin = page.getByRole("button", {name: "Spin", exact: true});
        await expect(spin).toBeVisible({timeout: 60_000});
        await spin.click();
        await expect(page.getByText(/This paid round is complete/).first()).toBeVisible({timeout: 30_000});

        await page.getByRole("button", {name: "Game design", exact: true}).click();
        await page.getByRole("button", {name: "Edit", exact: true}).first().click();
        await page.getByRole("textbox", {name: "Description (optional)"}).fill("Play reset probe");
        await page.getByRole("button", {name: "Save", exact: true}).click();
        await page.getByRole("button", {name: "Play", exact: true}).click();

        // The old runtime was materialized from the previous design. It must not keep spinning
        // silently after the source changes.
        await expect(page.getByRole("button", {name: "Start playing"})).toBeVisible({timeout: 60_000});
        await expect(page.getByText(/saved design changed, so the Play session was reset/)).toBeVisible();
    });

    test("Simulation review shows the exact-math reference for a current sample", async ({page}) => {
        await page.goto("/");
        // The exact card may still be loading when the page first paints; wait for whichever action it
        // settles on instead of sampling visibility once and guessing wrong.
        const exactAction = page.getByRole("button", {name: /^(Compute|Recompute) exact outcome table$/}).first();
        await expect(exactAction).toBeVisible({timeout: 30_000});
        await exactAction.click();
        await expect(page.getByText("At a glance", {exact: true})).toBeVisible({timeout: 120_000});

        await page.getByRole("button", {name: "Simulation", exact: true}).click();
        const change = page.getByRole("button", {name: "Change settings", exact: true});
        const rounds = page.getByLabel(/^Spins \(paid \+ free\)/);
        // A retained completed report opens on Review, while a fresh project opens on Configure.
        await expect(rounds.or(change)).toBeVisible({timeout: 60_000});
        if (await change.isVisible().catch(() => false)) await change.click();
        await expect(rounds).toBeVisible({timeout: 30_000});
        await rounds.fill("1000");
        await page.getByRole("button", {name: "Run Simulation", exact: true}).click();
        await expect(page.getByText(/Simulation completed/).first()).toBeVisible({timeout: 60_000});
        await expect(page.getByText("Exact math reference")).toBeVisible({timeout: 30_000});
        await expect(page.getByText(/Exact for this saved design: RTP/)).toBeVisible();
    });
});

test("free games exact math includes a total RTP reference", async ({page}) => {
    test.setTimeout(360_000);
    const source = path.join(process.cwd(), "tests/e2e/fixtures/free-games-scope.json");
    const projectPath = path.join(
        fs.mkdtempSync(path.join(os.tmpdir(), "pokie-free-games-e2e-")),
        "free-games-scope.json",
    );
    fs.copyFileSync(source, projectPath);

    await page.goto("/#/home/design");
    await page.getByRole("button", {name: /advanced options/}).click();
    await page.locator("input:visible").first().fill(projectPath);
    await page.getByRole("button", {name: "Load", exact: true}).first().click();
    const save = page.getByRole("button", {name: /^(Create game design|Save to source file)$/});
    await expect(save).toBeEnabled({timeout: 60_000});
    await save.click();
    // A preceding test may still own an outcome-library job. Opening the saved project then correctly
    // asks for confirmation before cancelling that work; accept it so this test exercises the project
    // it just saved instead of hanging behind the guard.
    const overview = page.getByRole("button", {name: "Overview", exact: true});
    const openGuardConfirm = page.getByRole("button", {name: "Confirm", exact: true});
    await expect
        .poll(
            async () => {
                if (await overview.isVisible().catch(() => false)) return "overview";
                if (await openGuardConfirm.isVisible().catch(() => false)) {
                    await openGuardConfirm.click();
                    return "confirming";
                }
                return "waiting";
            },
            {timeout: 90_000, intervals: [500]},
        )
        .not.toBe("waiting");
    await expect(overview).toBeVisible({timeout: 90_000});

    await page.getByRole("button", {name: "Compute exact outcome table"}).click();
    await expect(page.getByText("At a glance", {exact: true})).toBeVisible({timeout: 240_000});
    await expect(page.getByText("265.3620%").first()).toBeVisible();
    await expect(page.getByText("208.8856%").first()).toBeVisible();
    await expect(page.getByText("Paid-spin RTP").first()).toBeVisible();
    // Long feature caveats are disclosed instead of filling the Overview. Open them once so their
    // exact wording remains covered by the regression test.
    await page.getByRole("button", {name: "Show free-games and RTP caveats", exact: true}).click();
    await expect(page.getByText("Free-games RTP included").first()).toBeVisible();
    await expect(page.getByText(/additive free-game retriggers/).first()).toBeVisible();
    await expect(page.getByText("Free games have no hard cap", {exact: true})).toBeVisible();
    await expect(page.getByText("Structure valid — math warning: uncapped free games.")).toBeVisible();
    await page.getByText("Show feature triggers and free-games RTP derivation", {exact: true}).click();
    await expect(
        page.getByText(/Free-games RTP = trigger probability × expected free spins × paid-spin RTP/),
    ).toBeVisible();
    await expect(page.getByText(/featureRtp =/)).toHaveCount(0);

    await expect(page.getByRole("combobox", {name: "Rounds measured"})).toHaveValue(
        "Whole paid round (incl. free games)",
    );
    await expect(page.getByText(/Targeting Total RTP \(paid \+ free games\)/)).toBeVisible();
    // Changing only the scope must not silently leave a producer tuning paid-spin RTP on a game
    // whose players experience the whole round. The warning is actionable, not just explanatory.
    await page.getByRole("combobox", {name: "Rounds measured"}).click();
    await page.getByRole("option", {name: "Paid spin", exact: true}).click();
    await expect(page.getByText("This target still measures paid-spin RTP", {exact: true})).toBeVisible();
    await page.getByRole("button", {name: "Use whole-round RTP"}).click();
    await expect(page.getByRole("combobox", {name: "Rounds measured"})).toHaveValue(
        "Whole paid round (incl. free games)",
    );
    await page.getByRole("button", {name: "Show Fields to tune details"}).click();
    await expect(page.getByText("3 scatters → free games").first()).toBeVisible();
    await expect(page.getByText("Current exact values: paid-spin 56.4765%, whole-round 265.3620%.")).toBeVisible();
    await page.getByRole("button", {name: "Check settings"}).click();
    await expect(page.getByText(/Supported exact search over whole paid rounds/).first()).toBeVisible({
        timeout: 30_000,
    });
    await expect(page.getByText(/reports exact total RTP/).first()).toBeVisible();

    await page.getByRole("button", {name: "Simulation", exact: true}).click();
    const change = page.getByRole("button", {name: "Change settings", exact: true});
    const rounds = page.getByLabel(/^Spins \(paid \+ free\)/);
    await expect(rounds.or(change)).toBeVisible({timeout: 60_000});
    if (await change.isVisible().catch(() => false)) await change.click();
    await expect(page.getByText("Feature-games simulation budget")).toBeVisible({timeout: 30_000});
    await expect(page.getByText(/expands one paid round into about/)).toBeVisible();
    await rounds.fill("1000");
    await page.getByRole("button", {name: "Run Simulation", exact: true}).click();
    await expect(page.getByText(/Simulation completed/).first()).toBeVisible({timeout: 120_000});
    await expect(page.getByText("Exact math reference (paid + free games)").first()).toBeVisible({timeout: 60_000});
    await expect(page.getByText(/Exact total RTP/).first()).toBeVisible();
    await expect(page.getByText(/additive retriggers/).first()).toBeVisible();
    await expect(page.getByText(/paid rounds completed from .* spins \(paid \+ free\)/i).first()).toBeVisible({timeout: 60_000});
    fs.rmSync(path.dirname(projectPath), {recursive: true, force: true});
});

test("a hard free-games cap makes termination and total RTP explicit", async ({page}) => {
    test.setTimeout(180_000);
    await page.goto("/#/home/design");
    await page.getByRole("button", {name: "Use the starter"}).click();
    await page.getByLabel("Game id").fill("cap-e2e");
    await page.getByLabel("Game name").fill("Cap E2E");
    await page.getByRole("tab", {name: /Mechanics/}).click();
    await page.getByRole("button", {name: "Set up scatter + free games"}).click();
    await page.getByRole("dialog").getByRole("button", {name: "Add scatter and free games"}).click();
    const cap = page.getByLabel("Maximum free games per feature");
    await expect(cap).toBeVisible({timeout: 30_000});
    await cap.fill("100");
    await cap.press("Tab");
    await expect(page.getByText("Capped at 100 free games per feature", {exact: true})).toBeVisible();
    await page.getByRole("button", {name: "Create game design"}).click();
    await expect(page.getByRole("button", {name: "Overview", exact: true})).toBeVisible({timeout: 90_000});
    await page.getByRole("button", {name: "Compute exact outcome table"}).click();
    await expect(page.getByText("At a glance", {exact: true})).toBeVisible({timeout: 120_000});
    await page.getByRole("button", {name: "Show free-games and RTP caveats", exact: true}).click();
    await expect(page.getByText("Free-games RTP included (capped)", {exact: true})).toBeVisible();
    await expect(page.getByText("Free games have no hard cap", {exact: true})).toHaveCount(0);
    await page.getByRole("button", {name: "Show all exact math figures", exact: true}).click();
    await expect(page.getByText("Max whole-round win (upper bound, capped)", {exact: true})).toBeVisible();
    await expect(page.getByText("Structure valid — exact outcome table available; certification is still separate.")).toBeVisible({timeout: 30_000});
    await page.getByText("Show feature triggers and free-games RTP derivation", {exact: true}).click();
    await expect(page.getByText("Cap per feature (initial award + retriggers)", {exact: true})).toBeVisible();
});

test("Replay groups free spins under the paid round's full spin count", async ({page}) => {
    // A retriggering feature can legitimately run dozens of screens; each Continue is a real settled
    // round. Give this path enough time to finish rather than mistaking a long feature for a stuck one.
    test.setTimeout(360_000);
    const source = path.join(process.cwd(), "tests/e2e/fixtures/free-games-scope.json");
    const projectPath = path.join(
        fs.mkdtempSync(path.join(os.tmpdir(), "pokie-replay-paid-round-e2e-")),
        "free-games-scope.json",
    );
    fs.copyFileSync(source, projectPath);
    // This test is about grouping recorded screens, not about an unbounded retrigger tail. Cap the
    // fixture copy so every run reaches a completed paid round in a bounded number of free spins.
    const fixture = JSON.parse(fs.readFileSync(projectPath, "utf8")) as {
        mechanics: {freeGames: {scatterSymbol: string; awardsByCount: Record<string, number>; maxFreeGames?: number}};
    };
    fixture.mechanics.freeGames.maxFreeGames = 15;
    fs.writeFileSync(projectPath, JSON.stringify(fixture, null, 4));

    await page.goto("/#/home/design");
    await page.getByRole("button", {name: /advanced options/}).click();
    await page.locator("input:visible").first().fill(projectPath);
    await page.getByRole("button", {name: "Load", exact: true}).first().click();
    const save = page.getByRole("button", {name: /^(Create game design|Save to source file)$/});
    await expect(save).toBeEnabled({timeout: 60_000});
    await save.click();
    await expect(page.getByRole("button", {name: "Overview", exact: true})).toBeVisible({timeout: 90_000});

    await page.getByRole("button", {name: "Play", exact: true}).click();
    await page.getByRole("button", {name: "Start playing"}).click();
    await page.getByRole("button", {name: "Find free games"}).click();
    const continueRound = page.getByRole("button", {name: "Continue round"});
    await expect(continueRound.or(page.getByText(/paid round is complete/i))).toBeVisible({timeout: 60_000});
    await expect(page.getByText(/browser-local: reloading the page starts a new Play session/i).first()).toBeVisible({timeout: 30_000});
    expect(await page.evaluate(() => {
        const event = new Event("beforeunload", {cancelable: true});
        window.dispatchEvent(event);
        return event.defaultPrevented;
    })).toBe(true);
    for (let step = 0; step < 200; step++) {
        if (await page.getByText(/This paid round is complete:/).first().isVisible().catch(() => false)) break;
        if (!(await continueRound.isVisible().catch(() => false))) {
            // The button is briefly replaced while the round request settles; do not mistake that
            // transition for a completed feature.
            await page.waitForTimeout(500);
            continue;
        }
        // The button is disabled while the previous request settles and disappears once the round
        // completes; a short click attempt is safer than waiting for a state that may be gone.
        await continueRound.click({timeout: 5_000}).catch(() => undefined);
        await page.waitForTimeout(400);
    }
    await expect(page.getByText(/This paid round is complete:/).first()).toBeVisible({timeout: 60_000});

    await page.getByRole("button", {name: "Replay", exact: true}).click();
    await page.getByText("Played rounds", {exact: true}).click();
    const headers = page.getByText(/Paid round · \d+ spins?/);
    await expect(headers.first()).toBeVisible({timeout: 30_000});
    await expect(page.getByText(/Session \d+ · /).first()).toBeVisible({timeout: 30_000});
    const spinCounts = (await headers.allInnerTexts())
        .map((text) => text.match(/Paid round · (\d+) spins?/))
        .filter((match): match is RegExpMatchArray => match !== null)
        .map((match) => Number(match[1]));
    expect(spinCounts.some((count) => count > 1)).toBe(true);
    await page.getByRole("checkbox", {name: "Show free-game steps"}).check();

    // A multi-spin paid round must retain both the paid trigger screen and the free spin(s), not just
    // the newest free spin. The paid row is the one whose own stake is 1; the free row's is 0.
    const multiSpinHeader = page.locator('[data-pokie-paid-round-spins]:not([data-pokie-paid-round-spins="1"])').first();
    await expect(multiSpinHeader).toBeVisible({timeout: 30_000});
    const roundId = await multiSpinHeader.getAttribute("data-pokie-paid-round-id");
    const recordedSpins = Number(await multiSpinHeader.getAttribute("data-pokie-paid-round-spins"));
    expect(roundId).toBeTruthy();
    expect(recordedSpins).toBeGreaterThan(1);
    const roundRows = page.locator(`[data-pokie-recorded-spin-round-id="${roundId}"]`);
    await expect(roundRows).toHaveCount(recordedSpins);
    await expect(page.locator(`[data-pokie-recorded-spin-round-id="${roundId}"][data-pokie-recorded-spin-stake="1"]`)).toHaveCount(1);
    await expect(page.locator(`[data-pokie-recorded-spin-round-id="${roundId}"][data-pokie-recorded-spin-stake="0"]`)).toHaveCount(recordedSpins - 1);
    await multiSpinHeader.getByRole("button", {name: "Inspect paid round"}).click();
    await expect(page.getByRole("button", {name: "Replay recorded round"})).toBeVisible({timeout: 30_000});
    await multiSpinHeader.getByRole("button", {name: "Replay recorded round"}).click();
    await expect(page.getByText("Loaded replay")).toBeVisible({timeout: 30_000});
    fs.rmSync(path.dirname(projectPath), {recursive: true, force: true});
});

test("Play offers a one-click finish and labels a feature screen's own win", async ({page}) => {
    test.setTimeout(180_000);
    const source = path.join(process.cwd(), "tests/e2e/fixtures/free-games-scope.json");
    const projectPath = path.join(
        fs.mkdtempSync(path.join(os.tmpdir(), "pokie-play-finish-e2e-")),
        "free-games-scope.json",
    );
    fs.copyFileSync(source, projectPath);

    await page.goto("/#/home/design");
    await page.getByRole("button", {name: /advanced options/}).click();
    await page.locator("input:visible").first().fill(projectPath);
    await page.getByRole("button", {name: "Load", exact: true}).first().click();
    const save = page.getByRole("button", {name: /^(Create game design|Save to source file)$/});
    await expect(save).toBeEnabled({timeout: 60_000});
    await save.click();
    await expect(page.getByRole("button", {name: "Overview", exact: true})).toBeVisible({timeout: 90_000});

    await page.getByRole("button", {name: "Play", exact: true}).click();
    await expect(page.getByText("Math preview", {exact: true})).toBeVisible();
    await page.getByRole("button", {name: "Start playing"}).click();
    await page.getByRole("button", {name: "Find free games"}).click();

    const finish = page.getByRole("button", {name: "Finish whole round", exact: true});
    await expect(finish).toBeVisible({timeout: 60_000});
    // A scenario search cannot start from the middle of an unsettled feature.
    await expect(page.getByRole("button", {name: "Find any win"})).toBeDisabled();
    await expect(page.getByText("Finish the current paid round before starting a scenario search.")).toBeVisible();
    // Resetting a session in the middle of a feature must not silently discard the paid round.
    await page.getByRole("button", {name: "Reset Play session"}).click();
    const resetDialog = page.getByRole("dialog");
    await expect(resetDialog).toContainText(/in-progress paid round/i);
    await resetDialog.getByRole("button", {name: "Cancel"}).click();
    await expect(finish).toBeVisible();
    await finish.click();
    await expect(page.getByText(/This paid round is complete:/).first()).toBeVisible({timeout: 60_000});
    // The player card is the last free-spin screen; its own win must not be labelled as the whole
    // round's win when the paid-round total is shown separately above it.
    await expect(page.getByText("Win on this screen", {exact: true}).first()).toBeVisible();
    await expect(page.getByText("Screen win multiplier (× bet)", {exact: true}).first()).toBeVisible();

    fs.rmSync(path.dirname(projectPath), {recursive: true, force: true});
});

test("PAR import compares exact math for both drafts before applying", async ({page}) => {
    test.setTimeout(360_000);
    const source = path.join(process.cwd(), "tests/e2e/fixtures/free-games-scope.json");
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-par-import-e2e-"));
    const parPath = path.join(workDir, "scope.par.xlsx");
    execFileSync(process.execPath, ["dist/cli/pokie.js", "par", "export", source, "--out", parPath], {
        cwd: process.cwd(),
        stdio: "pipe",
    });

    await page.goto("/#/home/design");
    await page.getByRole("button", {name: "Open PAR import"}).click();
    await page.getByRole("textbox", {name: "PAR sheet path"}).fill(parPath);
    await page.getByRole("button", {name: "Import", exact: true}).click();
    await expect(page.getByText("Imported — not applied yet")).toBeVisible({timeout: 60_000});
    await page.getByRole("button", {name: "Continue to preview the game model"}).click();

    await expect(page.getByText("Exact math comparison", {exact: true})).toBeVisible();
    await page.getByRole("button", {name: "Compare exact RTP"}).click();
    const table = page.getByRole("table", {name: "PAR import exact math comparison"});
    await expect(table).toBeVisible({timeout: 240_000});
    await expect(table.getByRole("row", {name: /Paid-spin RTP/})).toContainText("%");
    await expect(table.getByRole("row", {name: /Total RTP \(paid \+ free games\)/})).toContainText("%");
    await expect(table.getByRole("row", {name: /Free-games RTP/})).toContainText("%");
    await expect(table.getByRole("row", {name: /Hit frequency/})).toContainText("%");
    await expect(table.getByRole("row", {name: /Outcomes/})).toContainText(",");
    fs.rmSync(workDir, {recursive: true, force: true});
});

test("PAR import says mathematical fields match when only metadata differs", async ({page}) => {
    test.setTimeout(120_000);
    const source = path.join(process.cwd(), "tests/e2e/fixtures/free-games-scope.json");
    const workDir = fs.mkdtempSync(path.join(os.tmpdir(), "pokie-par-same-e2e-"));
    const parPath = path.join(workDir, "same.par.xlsx");
    execFileSync(process.execPath, ["dist/cli/pokie.js", "par", "export", source, "--out", parPath], {
        cwd: process.cwd(),
        stdio: "pipe",
    });

    await page.goto("/#/home/design");
    await page.getByRole("button", {name: /advanced options/}).click();
    await page.locator("input:visible").first().fill(source);
    await page.getByRole("button", {name: "Load", exact: true}).first().click();
    await expect(page.getByRole("textbox", {name: "PAR sheet path"})).toBeVisible({timeout: 60_000});
    await page.getByRole("textbox", {name: "PAR sheet path"}).fill(parPath);
    await page.getByRole("button", {name: "Import", exact: true}).click();
    await expect(page.getByText("Imported — not applied yet")).toBeVisible({timeout: 60_000});
    await page.getByRole("button", {name: "Continue to preview the game model"}).click();

    await expect(page.getByText(/Definition comparison: no mathematical differences/)).toBeVisible({timeout: 60_000});
    await expect(page.getByText(/Some technical metadata could not be compared/)).toBeVisible();
    fs.rmSync(workDir, {recursive: true, force: true});
});
