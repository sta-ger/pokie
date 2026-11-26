import {BLUEPRINT_SECTIONS, classifyIssuesBySection} from "../../../cli/studio-client/src/domain/interpret/BlueprintSections.js";

describe("guided design sections", () => {
    it("exposes mechanics as its own section instead of folding features into bets", () => {
        expect(BLUEPRINT_SECTIONS.map((section) => section.id)).toEqual([
            "basics",
            "layout",
            "symbols",
            "reels",
            "paytable",
            "bets",
            "mechanics",
        ]);
    });

    it("routes feature and win-model validation to the section that owns the field", () => {
        const {bySection, unclassified} = classifyIssuesBySection([
            {code: "blueprint-mechanics-freegames-invalid", severity: "error", message: "free games"},
            {code: "weighted-bonus-composition", severity: "error", message: "bonus"},
            {code: "blueprint-winmodel-paylines-ignored", severity: "warning", message: "paylines ignored"},
            {code: "blueprint-betmodes-buyfeature-requires-freegames", severity: "error", message: "buy feature"},
            {code: "blueprint-not-object", severity: "error", message: "not an object"},
        ]);

        expect(bySection.mechanics.map((issue) => issue.code)).toEqual([
            "blueprint-mechanics-freegames-invalid",
            "weighted-bonus-composition",
        ]);
        expect(bySection.layout.map((issue) => issue.code)).toEqual(["blueprint-winmodel-paylines-ignored"]);
        expect(bySection.bets.map((issue) => issue.code)).toEqual(["blueprint-betmodes-buyfeature-requires-freegames"]);
        expect(unclassified.map((issue) => issue.code)).toEqual(["blueprint-not-object"]);
    });
});
