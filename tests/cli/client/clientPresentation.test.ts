import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {BuildCommand} from "../../../cli/commands/BuildCommand.js";
import {ClientCommand} from "../../../cli/commands/ClientCommand.js";
import {CLIENT_PRODUCT_NAME, describeClientGameTitle} from "../../../cli/client/clientPresentation.js";

const clientHtml = readFileSync(resolve(process.cwd(), "cli/client/index.html"), "utf8");
const clientMain = readFileSync(resolve(process.cwd(), "cli/client/main.ts"), "utf8");
const readme = readFileSync(resolve(process.cwd(), "README.md"), "utf8");
const staleProductStatusLabels = /\b(preview|experimental|prototype|legacy|deprecated|migration)\b/i;

describe("POKIE client public presentation", () => {
    it("keeps every public client entry surface free of stale product-status labels", () => {
        const readmeClientCommand = readme.match(/`npx pokie client\n? {2}<packageRoot>`[^;]+;/)?.[0];
        const fallbackTitle = clientHtml.match(/<title>([^<]+)<\/title>/)?.[1];
        const fallbackHeader = clientHtml.match(/<h1 id="game-title">([^<]+)<\/h1>/)?.[1];
        const runtimeGameTitleAssignment = clientMain.match(/elements\.gameTitle\.textContent = ([^;]+);/)?.[1];

        expect(CLIENT_PRODUCT_NAME).toBe("POKIE client");
        expect(describeClientGameTitle("Fixture Slot")).toBe("Fixture Slot — POKIE client");
        expect(readmeClientCommand).toContain("serves the POKIE browser client for a running `pokie serve`");
        expect(fallbackTitle).toBe(CLIENT_PRODUCT_NAME);
        expect(fallbackHeader).toBe(CLIENT_PRODUCT_NAME);
        expect(runtimeGameTitleAssignment).toBe("describeClientGameTitle(response.game.name)");

        expect(describeClientGameTitle("Fixture Slot")).not.toMatch(staleProductStatusLabels);
        expect(readmeClientCommand).not.toMatch(staleProductStatusLabels);
        expect(fallbackTitle).not.toMatch(staleProductStatusLabels);
        expect(fallbackHeader).not.toMatch(staleProductStatusLabels);
        expect(runtimeGameTitleAssignment).not.toMatch(staleProductStatusLabels);
    });

    it("keeps preview language for the genuine no-write build action", () => {
        expect(new BuildCommand("test").getDescription()).toContain("--dry-run validates and previews without writing anything");
    });

    it("keeps the client contract's compatibility diagnostic distinct from a product-status label", async () => {
        const start = jest.fn().mockResolvedValue({host: "127.0.0.1", port: 3100});
        const command = new ClientCommand(
            () => ({start, stop: jest.fn().mockResolvedValue(undefined)}),
            "/fixture/client",
            () => undefined,
        );
        const logSpy = jest.spyOn(console, "log").mockImplementation(() => undefined);

        await command.run(["./fixture-game", "--no-open"]);

        const compatibilityDiagnostic = logSpy.mock.calls.map(([message]) => message).find((message) => message.startsWith("Talking to "));
        expect(compatibilityDiagnostic).toBe(
            'Talking to a pokie serve API expected at http://127.0.0.1:3000 — start it separately (e.g. "pokie serve") or use "pokie dev" to run both together.',
        );
        expect(compatibilityDiagnostic).not.toMatch(staleProductStatusLabels);

        logSpy.mockRestore();
    });
});
