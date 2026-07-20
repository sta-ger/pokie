import {Button, Table, TextInput} from "@mantine/core";
import {useState} from "react";
import {addBetMode, asBetModesList, duplicateBetModeAt, moveBetModeAt, removeBetModeAt, setBetModeField} from "../../domain/blueprintFormOps";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {BufferedNumberInput} from "../common/BufferedNumberInput";
import {BufferedTextInput} from "../common/BufferedTextInput";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {RowActions} from "../common/RowActions";

export function BetModesEditor({blueprint, mutate}: {blueprint: Record<string, unknown>; mutate: BlueprintMutate}) {
    const betModes = asBetModesList(blueprint.betModes);
    const [newBetModeId, setNewBetModeId] = useState("");

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
                    value={newBetModeId}
                    onChange={(event) => setNewBetModeId(event.currentTarget.value)}
                />
                <Button
                    variant="default"
                    onClick={() => {
                        const id = newBetModeId.trim();
                        if (id.length === 0) {
                            return;
                        }
                        mutate((b) => addBetMode(b, id));
                        setNewBetModeId("");
                    }}
                >
                    Add bet mode
                </Button>
            </QuickActions>
        </PageSection>
    );
}
