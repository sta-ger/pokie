import type {ValidationIssue} from "../../api/types";
import type {BlueprintValidationView} from "./BlueprintEditor";

// The guided Design & Build editor groups its fields into named sections -- this module maps the
// server's already-computed, flat ValidationIssue[] onto those same sections *for display only*.
// ValidationIssue carries no structured path/field (see GameBlueprintValidator.ts), just a `code` and a
// human-readable `message` -- location info is only inferable from `code` prefixes, so that's what this
// classifies on. This is a pure display categorization over results the validator already produced, not
// a re-implementation of any check: the canonical rules stay exactly where they are, server-side.
export type BlueprintSectionId = "basics" | "layout" | "symbols" | "reels" | "paytable" | "bets";

export const BLUEPRINT_SECTIONS: {id: BlueprintSectionId; label: string}[] = [
    {id: "basics", label: "Game basics"},
    {id: "layout", label: "Layout"},
    {id: "symbols", label: "Symbols"},
    {id: "reels", label: "Reels"},
    {id: "paytable", label: "Paytable"},
    {id: "bets", label: "Bets"},
];

// Every `blueprint-*` issue code from GameBlueprintValidator.ts falls under exactly one of these
// prefixes (verified against the validator's full code list) except `blueprint-not-object`, which
// isn't attributable to any single section -- that one deliberately falls through to `unclassified`
// below rather than being force-matched into an arbitrary bucket.
const SECTION_CODE_PREFIXES: Record<BlueprintSectionId, string[]> = {
    basics: ["blueprint-manifest-"],
    layout: ["blueprint-reels-", "blueprint-rows-", "blueprint-paylines-", "blueprint-payline-"],
    symbols: ["blueprint-symbols-", "blueprint-wilds-", "blueprint-scatters-"],
    // "blueprint-reelstrip" (no trailing "s") covers reelstrip-/reelstrips-/reelstripgeneration- alike.
    reels: ["blueprint-reelstrip", "blueprint-symbolweights-", "blueprint-weighting-"],
    paytable: ["blueprint-paytable-", "blueprint-symbol-missing-payout"],
    bets: ["blueprint-availablebets-"],
};

function sectionForIssue(issue: ValidationIssue): BlueprintSectionId | undefined {
    return BLUEPRINT_SECTIONS.map((section) => section.id).find((id) =>
        SECTION_CODE_PREFIXES[id].some((prefix) => issue.code.startsWith(prefix)),
    );
}

export function classifyIssuesBySection(issues: ValidationIssue[]): {
    bySection: Record<BlueprintSectionId, ValidationIssue[]>;
    // Safety net for any code that doesn't match a known prefix (e.g. "blueprint-not-object", or a
    // future validator rule this mapping hasn't been taught about yet) -- never silently dropped.
    unclassified: ValidationIssue[];
} {
    const bySection = Object.fromEntries(BLUEPRINT_SECTIONS.map((section) => [section.id, [] as ValidationIssue[]])) as Record<
        BlueprintSectionId,
        ValidationIssue[]
    >;
    const unclassified: ValidationIssue[] = [];
    for (const issue of issues) {
        const section = sectionForIssue(issue);
        if (section) {
            bySection[section].push(issue);
        } else {
            unclassified.push(issue);
        }
    }
    return {bySection, unclassified};
}

export type SectionStatus = {tone: "neutral" | "success" | "warning" | "error"; errorCount: number; warningCount: number};

// "neutral" before Validate has ever produced a result (idle/loading) or after it failed outright
// (error, e.g. a network failure) -- never show a false "valid" checkmark without an actual validation
// result behind it. Otherwise counts *this section's own* errors/warnings independently of the overall
// blueprint status: a section can be clean even while the overall blueprint is "invalid" because of an
// issue in a different section.
export function describeSectionStatus(sectionId: BlueprintSectionId, view: BlueprintValidationView): SectionStatus {
    if (view.status === "idle" || view.status === "loading" || view.status === "error") {
        return {tone: "neutral", errorCount: 0, warningCount: 0};
    }
    const allIssues = view.status === "invalid" ? [...view.errors, ...view.warnings] : view.warnings;
    const {bySection} = classifyIssuesBySection(allIssues);
    const issues = bySection[sectionId];
    const errorCount = issues.filter((issue) => issue.severity === "error").length;
    const warningCount = issues.length - errorCount;
    if (errorCount > 0) {
        return {tone: "error", errorCount, warningCount};
    }
    if (warningCount > 0) {
        return {tone: "warning", errorCount: 0, warningCount};
    }
    return {tone: "success", errorCount: 0, warningCount: 0};
}

// Paths the guided editor already renders a dedicated Mantine input for (see MetadataFieldset.tsx/
// LayoutFieldset.tsx) -- an issue whose `path` is one of these shows as that input's own `error` instead
// of generically in its section's issue list. Every other issue (no path, or a path with no dedicated
// input -- most of Symbols/Reels/Paytable/Bets today) stays cross-field/section-level, unchanged.
const FIELD_LEVEL_PATHS = new Set(["manifest.id", "manifest.name", "manifest.version", "reels", "rows"]);

export function isFieldLevelIssue(issue: ValidationIssue): boolean {
    return issue.path !== undefined && FIELD_LEVEL_PATHS.has(issue.path);
}

// A section's own generic issue list should show only what isn't already surfaced next to a specific
// field -- avoids the same issue appearing twice in the same panel (once inline on the input, once
// generically below it).
export function crossFieldOnly(issues: ValidationIssue[]): ValidationIssue[] {
    return issues.filter((issue) => !isFieldLevelIssue(issue));
}

// The single message to show as a Mantine input's own `error` prop for one exact field path -- an error
// takes priority over a warning at the same path (Mantine inputs have no separate "warning" visual
// state), and `undefined` (no `error` prop at all) when nothing applies.
export function fieldErrorMessage(issues: ValidationIssue[], path: string): string | undefined {
    const matches = issues.filter((issue) => issue.path === path);
    return (matches.find((issue) => issue.severity === "error") ?? matches[0])?.message;
}

// The section-status text exposed to assistive tech alongside StatusBadge's own decorative,
// `aria-hidden` icon/count -- see StatusBadge.tsx for why both need to exist.
export function describeSectionStatusText(status: SectionStatus): string {
    if (status.tone === "neutral") {
        return "";
    }
    if (status.tone === "success") {
        return "valid";
    }
    const parts: string[] = [];
    if (status.errorCount > 0) {
        parts.push(`${status.errorCount} error${status.errorCount === 1 ? "" : "s"}`);
    }
    if (status.warningCount > 0) {
        parts.push(`${status.warningCount} warning${status.warningCount === 1 ? "" : "s"}`);
    }
    return parts.join(", ");
}
