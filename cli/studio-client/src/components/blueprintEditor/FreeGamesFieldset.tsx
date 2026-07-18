import {Button, Group, NumberInput, Select, Switch, Table} from "@mantine/core";
import {useState} from "react";
import {asStringList} from "../../domain/asStringList";
import {getFreeGames, hasFreeGames, removeFreeGamesAward, setFreeGamesAward, setFreeGamesEnabled, setFreeGamesScatterSymbol} from "../../domain/blueprintFormOps";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {RowActions} from "../common/RowActions";

export function FreeGamesFieldset({blueprint, mutate}: {blueprint: Record<string, unknown>; mutate: BlueprintMutate}) {
    const enabled = hasFreeGames(blueprint);
    const scatters = asStringList(blueprint.scatters);
    const freeGames = getFreeGames(blueprint);
    const awardRows = Object.entries(freeGames.awardsByCount)
        .map(([matchCount, awarded]) => ({matchCount: Number(matchCount), awarded}))
        .sort((a, b) => a.matchCount - b.matchCount);

    const [newMatchCount, setNewMatchCount] = useState<number | string>("");
    const [newAward, setNewAward] = useState<number | string>("");

    return (
        <PageSection legend="Free games">
            <Switch
                label="Enable scatter-triggered free games"
                checked={enabled}
                onChange={(event) => mutate((b) => setFreeGamesEnabled(b, event.currentTarget.checked))}
                mb="md"
            />

            {enabled && (
                <>
                    <Select
                        label="Scatter symbol"
                        aria-label="Free games scatter symbol"
                        placeholder="Select a scatter symbol"
                        data={scatters}
                        value={freeGames.scatterSymbol.length > 0 ? freeGames.scatterSymbol : null}
                        onChange={(value) => mutate((b) => setFreeGamesScatterSymbol(b, value ?? ""))}
                        maw={280}
                        mb="md"
                    />

                    <Table.ScrollContainer minWidth={360}>
                        <Table>
                            <Table.Thead>
                                <Table.Tr>
                                    <Table.Th>Match count</Table.Th>
                                    <Table.Th>Free games awarded</Table.Th>
                                    <Table.Th />
                                </Table.Tr>
                            </Table.Thead>
                            <Table.Tbody>
                                {awardRows.map((row) => (
                                    <Table.Tr key={row.matchCount}>
                                        <Table.Td>{row.matchCount}</Table.Td>
                                        <Table.Td>
                                            <NumberInput
                                                aria-label={`Free games awarded for ${row.matchCount} matches`}
                                                defaultValue={row.awarded}
                                                onBlur={(event) => {
                                                    const value = Number(event.currentTarget.value);
                                                    if (Number.isFinite(value)) {
                                                        mutate((b) => setFreeGamesAward(b, row.matchCount, value));
                                                    }
                                                }}
                                            />
                                        </Table.Td>
                                        <Table.Td>
                                            <RowActions
                                                itemLabel={`free games award for ${row.matchCount} matches`}
                                                onRemove={() => mutate((b) => removeFreeGamesAward(b, row.matchCount))}
                                            />
                                        </Table.Td>
                                    </Table.Tr>
                                ))}
                            </Table.Tbody>
                        </Table>
                    </Table.ScrollContainer>
                    <QuickActions>
                        <NumberInput aria-label="Match count" placeholder="Match count" min={2} step={1} value={newMatchCount} onChange={setNewMatchCount} />
                        <NumberInput aria-label="Free games awarded" placeholder="Free games awarded" min={1} step={1} value={newAward} onChange={setNewAward} />
                        <Group>
                            <Button
                                variant="default"
                                onClick={() => {
                                    const matchCount = Number(newMatchCount);
                                    const awarded = Number(newAward);
                                    if (!Number.isFinite(matchCount) || !Number.isFinite(awarded)) {
                                        return;
                                    }
                                    mutate((b) => setFreeGamesAward(b, matchCount, awarded));
                                    setNewMatchCount("");
                                    setNewAward("");
                                }}
                            >
                                Add award
                            </Button>
                        </Group>
                    </QuickActions>
                </>
            )}
        </PageSection>
    );
}
