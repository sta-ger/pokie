import {Button, Checkbox, Group, NumberInput, Select, Stack, Table, Text, TextInput} from "@mantine/core";
import {addBetMode, duplicateBetModeAt, moveBetModeAt, removeBetModeAt, type BlueprintBetMode, updateBetMode} from "../../domain/blueprintFormOps";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {RowActions} from "../common/RowActions";

function modesFrom(blueprint: Record<string, unknown>): BlueprintBetMode[] {
    return Array.isArray(blueprint.betModes)
        ? blueprint.betModes.filter((mode): mode is BlueprintBetMode => typeof mode === "object" && mode !== null && !Array.isArray(mode))
        : [];
}

// The normal form editor for all persisted BetMode fields. Runtime semantics remain the validator's
// responsibility: it can explain cross-mode requirements (one default, buy feature/free games, etc.)
// more precisely than a component trying to guess a partially-authored configuration.
export function BetModesEditor({blueprint, mutate}: {blueprint: Record<string, unknown>; mutate: BlueprintMutate}) {
    const modes = modesFrom(blueprint);
    const update = (index: number, values: Partial<BlueprintBetMode>): void => mutate((b) => updateBetMode(b, index, values));

    return (
        <PageSection legend="Bet modes">
            <Text size="sm" c="dimmed">
                Bet modes are optional variants of the same game. Leave this empty for a normal base game. An
                <strong> ante</strong> mode charges more for a better feature chance; a <strong>buy feature</strong> mode
                lets the player pay a multiplier to start free games.
            </Text>
            <details>
                <summary>What each column means</summary>
                <Stack gap={4} mt="xs">
                    <Text size="sm"><strong>Id</strong> — short unique name used by the game code and reports, for example <code>base</code>, <code>ante</code> or <code>buy-bonus</code>.</Text>
                    <Text size="sm"><strong>Label</strong> — the player-facing name.</Text>
                    <Text size="sm"><strong>Cost multiplier</strong> — how many times the base bet this mode costs. <code>1</code> is the same stake.</Text>
                    <Text size="sm"><strong>Target RTP</strong> — optional math target for this mode. It is used for review and does not change the gameplay by itself.</Text>
                    <Text size="sm"><strong>Runtime</strong> — <em>Metadata only</em> keeps the row as documentation; <em>Base</em>, <em>Ante</em> and <em>Buy feature</em> wire the mode into the game. Set this on every row or leave every row as metadata only.</Text>
                    <Text size="sm"><strong>Default</strong> — exactly one mode should be the default when runtime modes are enabled; that is the mode a player starts in.</Text>
                    <Text size="sm"><strong>Forced free games</strong> — how many free games the purchase starts. Required for a <em>Buy feature</em> mode.</Text>
                </Stack>
            </details>
            {modes.length === 0 ? <Text size="sm" c="dimmed" mt="sm">No bet modes configured.</Text> : (
                <Table.ScrollContainer minWidth={760}>
                    <Table>
                        <Table.Thead><Table.Tr><Table.Th>Id</Table.Th><Table.Th>Label</Table.Th><Table.Th>Cost multiplier</Table.Th><Table.Th>Target RTP</Table.Th><Table.Th>Runtime</Table.Th><Table.Th>Default</Table.Th><Table.Th>Forced free games</Table.Th><Table.Th /></Table.Tr></Table.Thead>
                        <Table.Tbody>
                            {modes.map((mode, index) => (
                                <Table.Tr key={index}>
                                    <Table.Td><TextInput aria-label={`Bet mode ${index + 1} id`} defaultValue={mode.id} onBlur={(event) => update(index, {id: event.currentTarget.value})} /></Table.Td>
                                    <Table.Td><TextInput aria-label={`Bet mode ${index + 1} label`} defaultValue={mode.label ?? ""} onBlur={(event) => update(index, {label: event.currentTarget.value || undefined})} /></Table.Td>
                                    <Table.Td><NumberInput aria-label={`Bet mode ${index + 1} cost multiplier`} defaultValue={mode.costMultiplier} min={0} onBlur={(event) => {
                                        const value = Number(event.currentTarget.value);
                                        update(index, {costMultiplier: Number.isFinite(value) && event.currentTarget.value !== "" ? value : undefined});
                                    }} /></Table.Td>
                                    <Table.Td><NumberInput aria-label={`Bet mode ${index + 1} target RTP`} defaultValue={mode.targetRtp} min={0} onBlur={(event) => {
                                        const value = Number(event.currentTarget.value);
                                        update(index, {targetRtp: Number.isFinite(value) && event.currentTarget.value !== "" ? value : undefined});
                                    }} /></Table.Td>
                                    <Table.Td><Select aria-label={`Bet mode ${index + 1} runtime type`} value={mode.runtimeType ?? ""} data={[{value: "", label: "Metadata only"}, {value: "base", label: "Base"}, {value: "ante", label: "Ante"}, {value: "buyFeature", label: "Buy feature"}]} onChange={(value) => update(index, {runtimeType: value === "base" || value === "ante" || value === "buyFeature" ? value : undefined})} /></Table.Td>
                                    <Table.Td><Checkbox aria-label={`Bet mode ${index + 1} is default`} checked={mode.isDefault === true} onChange={(event) => update(index, {isDefault: event.currentTarget.checked || undefined})} /></Table.Td>
                                    <Table.Td><NumberInput aria-label={`Bet mode ${index + 1} forced free games`} defaultValue={mode.forcedFreeGames} min={1} onBlur={(event) => {
                                        const value = Number(event.currentTarget.value);
                                        update(index, {forcedFreeGames: Number.isFinite(value) && event.currentTarget.value !== "" ? value : undefined});
                                    }} /></Table.Td>
                                    <Table.Td><RowActions itemLabel={`bet mode ${index + 1}`} onDuplicate={() => mutate((b) => duplicateBetModeAt(b, index))} onRemove={() => mutate((b) => removeBetModeAt(b, index))} onMoveUp={index > 0 ? () => mutate((b) => moveBetModeAt(b, index, index - 1)) : undefined} onMoveDown={index < modes.length - 1 ? () => mutate((b) => moveBetModeAt(b, index, index + 1)) : undefined} /></Table.Td>
                                </Table.Tr>
                            ))}
                        </Table.Tbody>
                    </Table>
                </Table.ScrollContainer>
            )}
            <QuickActions><Group><Button variant="default" onClick={() => mutate(addBetMode)}>Add bet mode</Button></Group></QuickActions>
        </PageSection>
    );
}
