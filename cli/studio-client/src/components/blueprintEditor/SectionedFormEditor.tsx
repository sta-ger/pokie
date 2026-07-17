import {ScrollArea, Tabs} from "@mantine/core";
import {useState} from "react";
import type {ValidationIssue} from "../../api/types";
import {BLUEPRINT_SECTIONS, classifyIssuesBySection, describeSectionStatus, type BlueprintSectionId} from "../../domain/interpret/BlueprintSections";
import type {BlueprintValidationView} from "../../domain/interpret/BlueprintEditor";
import type {BlueprintMutate, ReelStripGenerationDraftsRef} from "../../hooks/useBlueprintEditor";
import {IssueList} from "../common/IssueList";
import {StatusBadge} from "../common/StatusBadge";
import {BetsList} from "./BetsList";
import {LayoutFieldset} from "./LayoutFieldset";
import {MetadataFieldset} from "./MetadataFieldset";
import {PaylinesEditor} from "./PaylinesEditor";
import {PaytableEditor} from "./PaytableEditor";
import {ReelGenerationModeSelector} from "./ReelGenerationModeSelector";
import {SymbolsTable} from "./SymbolsTable";

// The guided Design & Build editor's field groups, reorganized into 6 named sections instead of one
// long flat scroll -- same field components as the raw/non-guided editor (SymbolsTable, BetsList, etc.),
// just regrouped and each now showing its own filtered slice of the *same* validateBlueprint result
// (see BlueprintSections.ts's own doc comment on why this is a display categorization, not a new
// validation layer). BlueprintValidationPanel/BlueprintBuildPanel stay outside this component entirely
// (rendered by BlueprintEditorPage itself, below) -- they remain the single, unfiltered "общий summary
// проблем" and the one Build action, for both guided and raw editors alike.
//
// Deliberately does *not* move focus into the newly active panel on section change (unlike HomePage's
// own top-level tabs) -- Mantine's Tabs already keeps focus on the clicked/arrow-navigated tab itself,
// which is the correct, standard behavior for a roving-tabindex tablist; forcing focus into the panel
// on every change (as a naive copy of HomePage's pattern once did here) fights that and breaks
// multi-hop arrow-key navigation between tabs (confirmed: it moves focus to the panel after the first
// arrow press, so a second arrow press no longer lands on any tab at all).
export function SectionedFormEditor({
    blueprint,
    mutate,
    drafts,
    revision,
    validationView,
}: {
    blueprint: Record<string, unknown>;
    mutate: BlueprintMutate;
    drafts: ReelStripGenerationDraftsRef;
    revision: number;
    validationView: BlueprintValidationView;
}) {
    const [activeSection, setActiveSection] = useState<BlueprintSectionId>("basics");

    const errors: ValidationIssue[] = validationView.status === "invalid" ? validationView.errors : [];
    const warnings: ValidationIssue[] =
        validationView.status === "invalid" || validationView.status === "ok" ? validationView.warnings : [];
    const classifiedErrors = classifyIssuesBySection(errors);
    const classifiedWarnings = classifyIssuesBySection(warnings);
    const unclassified = [...classifiedErrors.unclassified, ...classifiedWarnings.unclassified];

    return (
        <div>
            {/* Safety net -- an issue whose code doesn't map to any section (e.g. "blueprint-not-object")
                must never be silently dropped just because it doesn't belong under a specific tab. */}
            <IssueList title="Errors" issues={unclassified.filter((issue) => issue.severity === "error")} />
            <IssueList title="Warnings" issues={unclassified.filter((issue) => issue.severity !== "error")} />

            <Tabs value={activeSection} onChange={(value) => setActiveSection(value as BlueprintSectionId)} keepMounted keepMountedMode="display-none">
                <ScrollArea type="auto" scrollbarSize={6}>
                    <Tabs.List style={{flexWrap: "nowrap"}}>
                        {BLUEPRINT_SECTIONS.map((section) => (
                            <Tabs.Tab
                                key={section.id}
                                value={section.id}
                                rightSection={<StatusBadge status={describeSectionStatus(section.id, validationView)} />}
                            >
                                {section.label}
                            </Tabs.Tab>
                        ))}
                    </Tabs.List>
                </ScrollArea>

                <Tabs.Panel value="basics">
                    <IssueList title="Errors" issues={classifiedErrors.bySection.basics} />
                    <IssueList title="Warnings" issues={classifiedWarnings.bySection.basics} />
                    <MetadataFieldset blueprint={blueprint} mutate={mutate} legend="Game basics" />
                </Tabs.Panel>

                <Tabs.Panel value="layout">
                    <IssueList title="Errors" issues={classifiedErrors.bySection.layout} />
                    <IssueList title="Warnings" issues={classifiedWarnings.bySection.layout} />
                    <LayoutFieldset blueprint={blueprint} mutate={mutate} />
                    <PaylinesEditor blueprint={blueprint} mutate={mutate} />
                </Tabs.Panel>

                <Tabs.Panel value="symbols">
                    <IssueList title="Errors" issues={classifiedErrors.bySection.symbols} />
                    <IssueList title="Warnings" issues={classifiedWarnings.bySection.symbols} />
                    <SymbolsTable blueprint={blueprint} mutate={mutate} />
                </Tabs.Panel>

                <Tabs.Panel value="reels">
                    <IssueList title="Errors" issues={classifiedErrors.bySection.reels} />
                    <IssueList title="Warnings" issues={classifiedWarnings.bySection.reels} />
                    <ReelGenerationModeSelector blueprint={blueprint} mutate={mutate} drafts={drafts} revision={revision} />
                </Tabs.Panel>

                <Tabs.Panel value="paytable">
                    <IssueList title="Errors" issues={classifiedErrors.bySection.paytable} />
                    <IssueList title="Warnings" issues={classifiedWarnings.bySection.paytable} />
                    <PaytableEditor blueprint={blueprint} mutate={mutate} />
                </Tabs.Panel>

                <Tabs.Panel value="bets">
                    <IssueList title="Errors" issues={classifiedErrors.bySection.bets} />
                    <IssueList title="Warnings" issues={classifiedWarnings.bySection.bets} />
                    <BetsList blueprint={blueprint} mutate={mutate} />
                </Tabs.Panel>
            </Tabs>
        </div>
    );
}
