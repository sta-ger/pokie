import {Button, Group, NumberInput, Select, Table, Text} from "@mantine/core";
import {useState} from "react";
import type {ValidationIssue} from "../../api/types";
import {asStringList} from "../../domain/asStringList";
import {addFreeGames, readFreeGames, removeFreeGames, removeFreeGamesAward, setFreeGamesAward, setFreeGamesScatterSymbol} from "../../domain/blueprintFormOps";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {IssueList} from "../common/IssueList";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {RowActions} from "../common/RowActions";

// The Mechanics section's own field editor -- scatter-triggered free games, the one mechanic
// GameBlueprint's own schema supports today (GameBlueprintMechanics.freeGames, see
// GameModelProjection.ts's own doc comment). Reuses the exact same mutate()/PageSection/RowActions
// pattern every other Game Model field editor already uses (PaytableEditor, BetsList) -- this is not a
// second, competing mutation surface, just this mechanic's own fieldset, wired into the same
// GameModelSections "Edit -> mutate -> Save" flow as everything else in the tab.
export function FreeGamesFieldset({
    blueprint,
    mutate,
    issues = [],
}: {
    blueprint: Record<string, unknown>;
    mutate: BlueprintMutate;
    issues?: ValidationIssue[];
}) {
    const freeGames = readFreeGames(blueprint);
    const scatters = asStringList(blueprint.scatters);
    const [newMatchCount, setNewMatchCount] = useState<number | string>("");
    const [newAwarded, setNewAwarded] = useState<number | string>("");
    const errors = issues.filter((issue) => issue.severity === "error");
    const warnings = issues.filter((issue) => issue.severity !== "error");

    if (freeGames === undefined) {
        return (
            <PageSection legend="Free games">
                <Text size="sm" c="dimmed" mb="xs">
                    No scatter-triggered free games configured.
                </Text>
                <Button variant="default" size="xs" onClick={() => mutate((b) => addFreeGames(b))}>
                    Add free games
                </Button>
            </PageSection>
        );
    }

    const awards = Object.entries(freeGames.awardsByCount);

    return (
        <PageSection legend="Free games">
            <IssueList title="Errors" issues={errors} />
            <IssueList title="Warnings" issues={warnings} />
            <Select
                label="Scatter symbol"
                placeholder="Scatter symbol"
                data={scatters}
                value={freeGames.scatterSymbol.length > 0 ? freeGames.scatterSymbol : null}
                onChange={(value) => mutate((b) => setFreeGamesScatterSymbol(b, value ?? ""))}
                mb="sm"
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
                        {awards.map(([count, awarded]) => (
                            <Table.Tr key={count}>
                                <Table.Td>{count}</Table.Td>
                                <Table.Td>
                                    <NumberInput
                                        aria-label={`${count}x free games awarded`}
                                        defaultValue={awarded}
                                        onBlur={(event) => {
                                            const value = Number(event.currentTarget.value);
                                            if (Number.isFinite(value)) {
                                                mutate((b) => setFreeGamesAward(b, Number(count), value));
                                            }
                                        }}
                                    />
                                </Table.Td>
                                <Table.Td>
                                    <RowActions
                                        itemLabel={`${count}x free games award`}
                                        onRemove={() => mutate((b) => removeFreeGamesAward(b, Number(count)))}
                                    />
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>
            <QuickActions>
                <NumberInput aria-label="New match count" placeholder="Match count" min={2} step={1} value={newMatchCount} onChange={setNewMatchCount} />
                <NumberInput aria-label="New free games awarded" placeholder="Free games awarded" value={newAwarded} onChange={setNewAwarded} />
                <Group>
                    <Button
                        variant="default"
                        onClick={() => {
                            const matchCount = Number(newMatchCount);
                            const awarded = Number(newAwarded);
                            if (!Number.isFinite(matchCount) || !Number.isFinite(awarded)) {
                                return;
                            }
                            mutate((b) => setFreeGamesAward(b, matchCount, awarded));
                            setNewMatchCount("");
                            setNewAwarded("");
                        }}
                    >
                        Add award
                    </Button>
                    <Button variant="subtle" color="red" onClick={() => mutate((b) => removeFreeGames(b))}>
                        Remove free games
                    </Button>
                </Group>
            </QuickActions>
        </PageSection>
    );
}
