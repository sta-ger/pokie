import {readFileSync} from "node:fs";
import {resolve} from "node:path";
import {BuildCommand} from "../../../cli/commands/BuildCommand.js";
import {CLIENT_PRODUCT_NAME, describeClientGameTitle} from "../../../cli/client/clientPresentation.js";
import {extractKnownRoundView} from "../../../cli/client/interpretResponse.js";

const clientHtml = readFileSync(resolve(process.cwd(), "cli/client/index.html"), "utf8");
const staleProductStatusLabels = /\b(preview|experimental|prototype|legacy|deprecated|migration)\b/i;

describe("POKIE client public presentation", () => {
    it("renders the supported client name without a stale product-status label", () => {
        expect(CLIENT_PRODUCT_NAME).toBe("POKIE client");
        expect(describeClientGameTitle("Fixture Slot")).toBe("Fixture Slot — POKIE client");
        expect(clientHtml).toContain("<title>POKIE client</title>");
        expect(clientHtml).toContain('<h1 id="game-title">POKIE client</h1>');
        expect(describeClientGameTitle("Fixture Slot")).not.toMatch(staleProductStatusLabels);
        expect(clientHtml.match(/<title>.*<\/title>/)?.[0]).not.toMatch(staleProductStatusLabels);
    });

    it("keeps preview language for a genuinely no-write action and compatible response fields", () => {
        expect(new BuildCommand("test").getDescription()).toContain("--dry-run validates and previews without writing anything");
        expect(
            extractKnownRoundView({
                sessionId: "s1",
                game: {id: "fixture", name: "Fixture Slot", version: "1.0.0"},
                credits: 1000,
                win: 5,
                screen: [["A"]],
            }),
        ).toEqual({credits: 1000, bet: undefined, win: 5, screen: [["A"]]});
    });
});
