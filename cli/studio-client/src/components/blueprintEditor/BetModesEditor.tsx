import {Button, Table, TextInput} from "@mantine/core";
import {addBetMode, asBetModesList, describeNewBetModeDraft, duplicateBetModeAt, moveBetModeAt, removeBetModeAt, setBetModeField} from "../../domain/blueprintFormOps";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {BufferedNumberInput} from "../common/BufferedNumberInput";
import {BufferedTextInput} from "../common/BufferedTextInput";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {RowActions} from "../common/RowActions";

// `newBetModeId`/`onNewBetModeIdChange` are lifted into the caller (MechanicsEditorTab) rather than
// owned locally -- this component only renders while its own Stepper step is active, so a local
// useState here would be silently discarded (and any in-progress, not-yet-added id lost with zero
// warning) every time the user switches to another step and back. Lifting it into a component that
// stays mounted for the tab's whole lifetime is what actually preserves it; MechanicsEditorTab still
// resets it on every wholesale blueprint replace (New/Load/Discard), the same way editor.formGeneration
// already resets everything else derived from the previous blueprint.
export function BetModesEditor({
    blueprint,
    mutate,
    newBetModeId,
    onNewBetModeIdChange,
}: {
    blueprint: Record<string, unknown>;
    mutate: BlueprintMutate;
    newBetModeId: string;
    onNewBetModeIdChange: (value: string) => void;
}) {
    const betModes = asBetModesList(blueprint.betModes);
    const draftStatus = describeNewBetModeDraft(betModes, newBetModeId);
    // A typed-but-not-yet-added id is real, uncommitted state (see MechanicsEditorTab's own doc comment
    // on why it's lifted up to survive Stepper navigation) -- the description text must say so, not just
    // silently keep showing the same static instructions regardless of whether there's a draft in
    // progress.
    const newBetModeIdDescription =
        draftStatus.status === "ready"
            ? `Draft -- "${draftStatus.id}" isn't part of the bet mode list yet. Add (or press Enter) to include it.`
            : "Give it a unique id, then Add (or press Enter) to create the row, then fill in its label, cost multiplier, and target RTP below.";

    function handleAdd(): void {
        if (draftStatus.status !== "ready") {
            return;
        }
        mutate((b) => addBetMode(b, draftStatus.id));
        onNewBetModeIdChange("");
    }

    return (
        <PageSection legend="Bet modes">
            <Table.ScrollContainer minWidth={640}>
                <Table>
                    <Table.Thead>
                        <Table.Tr>
                            <Table.Th>Id</Table.Th>
                            <Table.Th>Label</Table.Th>
                            <Table.Th>Cost multiplier</Table.Th>
                            <Table.Th>Target RTP</Table.Th>
                            <Table.Th />
                        </Table.Tr>
                    </Table.Thead>
                    <Table.Tbody>
                        {betModes.map((mode, index) => (
                            <Table.Tr key={index}>
                                <Table.Td>
                                    <BufferedTextInput
                                        aria-label={`Bet mode ${index + 1} id`}
                                        value={mode.id}
                                        onCommit={(value) => mutate((b) => setBetModeField(b, index, "id", value))}
                                    />
                                </Table.Td>
                                <Table.Td>
                                    <BufferedTextInput
                                        aria-label={`Bet mode ${index + 1} label`}
                                        value={mode.label ?? ""}
                                        onCommit={(value) => mutate((b) => setBetModeField(b, index, "label", value.length > 0 ? value : undefined))}
                                    />
                                </Table.Td>
                                <Table.Td>
                                    <BufferedNumberInput
                                        aria-label={`Bet mode ${index + 1} cost multiplier`}
                                        value={mode.costMultiplier ?? ""}
                                        onCommit={(value) => mutate((b) => setBetModeField(b, index, "costMultiplier", value))}
                                    />
                                </Table.Td>
                                <Table.Td>
                                    <BufferedNumberInput
                                        aria-label={`Bet mode ${index + 1} target RTP`}
                                        value={mode.targetRtp ?? ""}
                                        onCommit={(value) => mutate((b) => setBetModeField(b, index, "targetRtp", value))}
                                    />
                                </Table.Td>
                                <Table.Td>
                                    <RowActions
                                        itemLabel={`bet mode ${index + 1}`}
                                        onDuplicate={() => mutate((b) => duplicateBetModeAt(b, index))}
                                        onRemove={() => mutate((b) => removeBetModeAt(b, index))}
                                        onMoveUp={index > 0 ? () => mutate((b) => moveBetModeAt(b, index, index - 1)) : undefined}
                                        onMoveDown={index < betModes.length - 1 ? () => mutate((b) => moveBetModeAt(b, index, index + 1)) : undefined}
                                    />
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>
            <QuickActions>
                <TextInput
                    placeholder="New bet mode id"
                    aria-label="New bet mode id"
                    description={newBetModeIdDescription}
                    value={newBetModeId}
                    onChange={(event) => onNewBetModeIdChange(event.currentTarget.value)}
                    onKeyDown={(event) => {
                        if (event.key === "Enter") {
                            event.preventDefault();
                            handleAdd();
                        }
                    }}
                    error={draftStatus.status === "duplicate" ? `"${draftStatus.id}" is already used by another bet mode -- ids must be unique.` : undefined}
                />
                <Button variant="default" onClick={handleAdd} disabled={draftStatus.status !== "ready"}>
                    Add bet mode
                </Button>
            </QuickActions>
        </PageSection>
    );
}
