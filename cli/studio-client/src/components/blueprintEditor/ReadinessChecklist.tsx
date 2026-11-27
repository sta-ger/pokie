import {Alert, Anchor, Badge, Table, Text} from "@mantine/core";
import {useEffect, useId, useState} from "react";
import {
    BLUEPRINT_SECTIONS,
    describeSectionStatus,
    type BlueprintSectionId,
} from "../../domain/interpret/BlueprintSections";
import type {BlueprintValidationView} from "../../domain/interpret/BlueprintEditor";
import type {BlueprintMathPreviewStatus} from "./BlueprintMathPreviewPanel";
import {PageSection} from "../common/PageSection";
import {BlueprintValidationScopeBadges} from "../common/ValidationScopeBadges";
import {describeBlueprintValidationScopes} from "../../domain/validationScope";

type ChecklistTone = "done" | "pending" | "optional" | "later" | "checking" | "warning" | "error";

type ChecklistItem = {
    id: BlueprintSectionId | "exact-math" | "simulation" | "par";
    label: string;
    tone: ChecklistTone;
    detail: string;
};

const TONE_COLOR: Record<ChecklistTone, string> = {done: "green", pending: "gray", optional: "gray", later: "gray", checking: "blue", warning: "yellow", error: "red"};
const TONE_LABEL: Record<ChecklistTone, string> = {done: "Ready", pending: "To do", optional: "Optional", later: "After save", checking: "Checking", warning: "Review", error: "Blocked"};

function sectionItems(view: BlueprintValidationView): ChecklistItem[] {
    return BLUEPRINT_SECTIONS.map((section) => {
        const status = describeSectionStatus(section.id, view);
        if (status.tone === "success") {
            return {id: section.id, label: section.label, tone: "done", detail: "Valid in the current design."};
        }
        if (status.tone === "warning") {
            return {
                id: section.id,
                label: section.label,
                tone: "warning",
                detail: `${status.warningCount} warning${status.warningCount === 1 ? "" : "s"} to review.`,
            };
        }
        if (status.tone === "error") {
            return {
                id: section.id,
                label: section.label,
                tone: "error",
                detail: `${status.errorCount} error${status.errorCount === 1 ? "" : "s"} to fix.`,
            };
        }
        if (view.status === "loading") {
            return {
                id: section.id,
                label: section.label,
                tone: "checking",
                detail: "Checking validation…",
            };
        }
        return {
            id: section.id,
            label: section.label,
            tone: "pending",
            detail: "Waiting for validation.",
        };
    });
}

function mathItems(status: BlueprintMathPreviewStatus, savedDesign: boolean): ChecklistItem[] {
    let exactMath: ChecklistItem;
    if (status === "ok") {
        exactMath = {id: "exact-math", label: "Exact math", tone: "done", detail: savedDesign
            ? "Calculated for this draft only — save the design, then recompute the project's own exact table."
            : "Calculated for this draft only — the saved project needs its own exact result."};
    } else if (status === "loading") {
        exactMath = {id: "exact-math", label: "Exact math", tone: "checking", detail: "Calculating the current draft…"};
    } else if (status === "unavailable") {
        exactMath = {id: "exact-math", label: "Exact math", tone: "warning", detail: "Preview unavailable; read the message in Math preview."};
    } else if (status === "error") {
        exactMath = {id: "exact-math", label: "Exact math", tone: "error", detail: "The preview failed; review Math preview and retry."};
    } else {
        exactMath = {id: "exact-math", label: "Exact math", tone: "optional", detail: "Not calculated yet. Use Calculate exact math below if you want to check this draft before saving."};
    }
    return [
        exactMath,
        {id: "simulation", label: "Simulation", tone: "later", detail: savedDesign
            ? "After saving: open Simulation and run paid rounds."
            : "After creating the game design: open Simulation and run paid rounds."},
        {id: "par", label: "PAR sheet", tone: "later", detail: savedDesign
            ? "After saving: open Build/Export and build PAR sheet (.xlsx)."
            : "After creating the game design: open Build/Export and build PAR sheet (.xlsx)."},
    ];
}

function remainingAlertTitle(checking: boolean, blocked: boolean, count: number): string {
    const items = `${count} item${count === 1 ? "" : "s"}`;
    if (checking) return `Still checking: ${items}`;
    if (blocked) return `Review required: ${items}`;
    return `Review before saving: ${items}`;
}

// The checklist stays short on purpose: the two numbers a first-time author needs are "what must be
// done before saving" and "what happens after saving". Math safety is shown as a separate scope badge,
// never folded into the word "Valid". Long section-by-section detail stays collapsed until asked for.
export function ReadinessChecklist({
    validationView,
    mathPreviewStatus,
    savedDesign = false,
}: {
    validationView: BlueprintValidationView;
    mathPreviewStatus: BlueprintMathPreviewStatus;
    savedDesign?: boolean;
}) {
    const items = [...sectionItems(validationView), ...mathItems(mathPreviewStatus, savedDesign)];
    const remaining = items.filter((item) => item.tone !== "done" && item.tone !== "later" && item.tone !== "optional");
    const remainingNames = remaining.map((item) => item.label).join(", ");
    const checking = validationView.status === "loading" || validationView.status === "stale";
    const blocked = validationView.status === "invalid" || validationView.status === "error" || validationView.status === "inconclusive";
    const [opened, setOpened] = useState(false);
    const [elapsedSeconds, setElapsedSeconds] = useState(0);
    const contentId = useId();
    const scopes = describeBlueprintValidationScopes(validationView, mathPreviewStatus);
    const mathWarning = scopes.some((scope) => scope.scope === "math" && scope.color === "yellow");

    useEffect(() => {
        if (!checking) {
            setElapsedSeconds(0);
            return undefined;
        }
        const startedAt = Date.now();
        setElapsedSeconds(0);
        const timer = window.setInterval(() => {
            setElapsedSeconds(Math.max(0, Math.floor((Date.now() - startedAt) / 1000)));
        }, 1000);
        return () => window.clearInterval(timer);
    }, [checking]);

    // A structural error is a blocker; show the detail immediately. A merely incomplete draft (exact
    // math not run yet) stays collapsed so the first screen is not a wall of TODOs.
    useEffect(() => {
        if (validationView.status === "invalid" || validationView.status === "error" || validationView.status === "inconclusive") {
            setOpened(true);
        }
    }, [validationView.status]);

    return (
        <PageSection legend="Readiness checklist">
            <div data-pokie-readiness-checklist data-pokie-validation-state={validationView.status}>
                <BlueprintValidationScopeBadges view={validationView} mathStatus={mathPreviewStatus} />
                {remaining.length === 0 ? (
                    <Alert color={mathWarning ? "yellow" : "green"} variant="light" title={savedDesign ? "Saved design is ready to update" : "Draft is ready to save"} mt="xs" mb="sm">
                        <Text size="sm">
                            Structure is valid{mathWarning ? " (review the math warning above)" : ""}.{" "}
                            {savedDesign
                                ? "Save to source file updates this saved design and opens its workspace."
                                : "Create game design saves this draft and opens its workspace."}
                        </Text>
                        <Text size="xs" c="dimmed" mt={4}>
                            Exact math is optional now. Simulation and PAR export come after saving.
                        </Text>
                    </Alert>
                ) : (
                    <Alert
                        color={blocked ? "red" : "blue"}
                        variant="light"
                        title={remainingAlertTitle(checking, blocked, remaining.length)}
                        mt="xs"
                        mb="sm"
                    >
                        <Text size="sm">
                            {checking
                                ? `Checking structure, then the optional math and feature paths — ${elapsedSeconds}s elapsed. You can keep editing; Studio rechecks after each change.`
                                : `${remainingNames}.`}
                        </Text>
                    </Alert>
                )}
                <Text size="sm" mt="xs">
                    <Anchor
                        component="button"
                        type="button"
                        aria-expanded={opened}
                        aria-controls={contentId}
                        aria-label={`${opened ? "Hide" : "Show"} readiness checklist details`}
                        onClick={() => setOpened((value) => !value)}
                    >
                        {opened ? "Hide" : "Show"} section-by-section details
                    </Anchor>
                </Text>
                <div id={contentId} hidden={!opened}>
                    <Table.ScrollContainer minWidth={560}>
                        <Table aria-label="Readiness checklist items">
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Item</Table.Th>
                                    <Table.Th>State</Table.Th>
                                    <Table.Th>What remains</Table.Th>
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {items.map((item) => (
                                    <Table.Tr key={item.id} data-checklist-item={item.id}>
                                        <Table.Td><Text size="sm">{item.label}</Text></Table.Td>
                                        <Table.Td><Badge color={TONE_COLOR[item.tone]} variant="light">{TONE_LABEL[item.tone]}</Badge></Table.Td>
                                        <Table.Td><Text size="sm">{item.detail}</Text></Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                </div>
            </div>
        </PageSection>
    );
}
