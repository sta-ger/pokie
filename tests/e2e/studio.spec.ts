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

    test("simulation uses readable precision and stop-reason labels", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Simulation", exact: true}).click();
        await page.getByLabel("Rounds *").fill("1000");
        await page.getByRole("button", {name: "Run Simulation"}).click();
        await expect(page.getByText(/Simulation completed — /)).toBeVisible({timeout: 60_000});
        await expect(page.getByText(/1000 usable samples · no precision target requested/i).first()).toBeVisible();
        await page.getByRole("button", {name: "Open full report"}).click();
        await expect(page.getByRole("rowheader", {name: "Stop reason"})).toBeVisible();
        await expect(page.getByRole("rowheader", {name: "Stop reason"}).locator("xpath=following-sibling::td[1]")).toHaveText(/requested rounds completed/i);
    });

    test("Play uses singular round wording for a single subround and delivery", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Play", exact: true}).click();
        const newSession = page.getByRole("button", {name: "New Play session"});
        await expect(newSession).toBeVisible({timeout: 30_000});
        await newSession.click();
        const spin = page.getByRole("button", {name: "Spin", exact: true});
        await expect(spin).toBeVisible({timeout: 60_000});
        await spin.click();
        await expect(page.getByText(/Round completed: 1 subround, 1 delivery/)).toBeVisible({timeout: 30_000});
        await expect(page.getByText(/1 subrounds/)).toHaveCount(0);
    });

    test("a completed optimization does not show indeterminate work", async ({page}) => {
        await page.goto("/");
        await page.getByRole("button", {name: "Check tuning support"}).click();
        await expect(page.getByText(/Supported finite same-type workflow/)).toBeVisible({timeout: 30_000});
        await page.getByRole("button", {name: "Run optimization"}).click();
        await expect(page.getByText(/Verdict:/)).toBeVisible({timeout: 60_000});
        await expect(page.getByText(/indeterminate/)).toHaveCount(0);
        await expect(page.getByText(/Finalizing/)).toHaveCount(0);
    });
});
