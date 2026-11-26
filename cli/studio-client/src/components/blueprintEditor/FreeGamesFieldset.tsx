import {Alert, Button, Group, NumberInput, Select, Table, Text} from "@mantine/core";
import {useState} from "react";
import type {ValidationIssue} from "../../api/types";
import {asStringList} from "../../domain/asStringList";
import {MAX_FREE_GAMES_CAP} from "../../../../../src/generated/GameBlueprint.js";
import {addFreeGames, readFreeGames, removeFreeGames, removeFreeGamesAward, setFreeGamesAward, setFreeGamesMaxFreeGames, setFreeGamesScatterSymbol} from "../../domain/blueprintFormOps";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {IssueList} from "../common/IssueList";
import {PageSection} from "../common/PageSection";
import {QuickActions} from "../common/QuickActions";
import {RowActions} from "../common/RowActions";
import {ScatterFreeGamesWizard} from "./ScatterFreeGamesWizard";

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
    onRequestSymbols,
}: {
    blueprint: Record<string, unknown>;
    mutate: BlueprintMutate;
    issues?: ValidationIssue[];
    /** Optional: jump to the Symbols editor when free games need a scatter symbol. */
    onRequestSymbols?: () => void;
}) {
    const freeGames = readFreeGames(blueprint);
    const scatters = asStringList(blueprint.scatters);
    const [newMatchCount, setNewMatchCount] = useState<number | string>("");
    const [newAwarded, setNewAwarded] = useState<number | string>("");
    const [wizardOpen, setWizardOpen] = useState(false);
    const errors = issues.filter((issue) => issue.severity === "error");
    const warnings = issues.filter((issue) => issue.severity !== "error");

    const hasScatter = scatters.length > 0;
    const scatterHint = (
        <Alert color="yellow" variant="light" title="Add a scatter symbol first" mb="xs">
            <Text size="sm">
                Free games need a scatter symbol to trigger. Add both in one guided step, or edit Symbols and Reels yourself.
            </Text>
            <Group mt={6} gap="xs">
                <Button size="xs" onClick={() => setWizardOpen(true)}>
                    Set up scatter + free games
                </Button>
                {onRequestSymbols !== undefined && (
                    <Button variant="subtle" size="xs" onClick={onRequestSymbols}>
                        Open Symbols
                    </Button>
                )}
            </Group>
        </Alert>
    );

    if (freeGames === undefined) {
        return (
            <PageSection legend="Free games">
                {wizardOpen && (
                    <ScatterFreeGamesWizard
                        blueprint={blueprint}
                        mutate={mutate}
                        opened
                        onClose={() => setWizardOpen(false)}
                    />
                )}
                {hasScatter ? (
                    <Text size="sm" c="dimmed" mb="xs">
                        No scatter-triggered free games configured.
                    </Text>
                ) : (
                    scatterHint
                )}
                <Button
                    variant="default"
                    size="xs"
                    disabled={!hasScatter}
                    title={hasScatter ? undefined : "Add a scatter symbol in Symbols first."}
                    onClick={() => mutate((b) => addFreeGames(b))}
                >
                    Add free games
                </Button>
            </PageSection>
        );
    }

    const awards = Object.entries(freeGames.awardsByCount);

    return (
        <PageSection legend="Free games">
            {wizardOpen && (
                <ScatterFreeGamesWizard
                    blueprint={blueprint}
                    mutate={mutate}
                    opened
                    onClose={() => setWizardOpen(false)}
                />
            )}
            <IssueList title="Errors" issues={errors} />
            <IssueList title="Warnings" issues={warnings} />
            {!hasScatter && scatterHint}
            <Text>Free games can retrigger; awards add together.</Text>
            <Text size="xs" c="dimmed" mb="sm">
                Each row is an exact scatter count. Only the counts listed below trigger free games; any unlisted count awards 0.
            </Text>
            <NumberInput
                label="Maximum free games per feature (optional)"
                description="Caps the trigger award and every retrigger. Leave blank for uncapped additive retriggers."
                aria-label="Maximum free games per feature"
                min={1}
                max={MAX_FREE_GAMES_CAP}
                allowDecimal={false}
                value={freeGames.maxFreeGames ?? ""}
                onChange={(value) => mutate((b) => setFreeGamesMaxFreeGames(b, typeof value === "number" && Number.isSafeInteger(value) && value >= 1 ? value : undefined))}
                mb="sm"
                style={{maxWidth: 320}}
            />
            {freeGames.maxFreeGames === undefined ? (
                <Alert color="yellow" variant="light" title="Additive retriggers have no hard cap" mb="sm">
                    <Text size="xs">
                        Exact total RTP is an expected value. The project&apos;s feature check will warn that not every possible round is proven to end.
                        Set a maximum free-games cap to make feature termination provable.
                    </Text>
                </Alert>
            ) : (
                <Alert color="green" variant="light" title={`Capped at ${freeGames.maxFreeGames} free games per feature`} mb="sm">
                    <Text size="xs">
                        The cap covers the trigger award and every retrigger, so the feature cannot exceed it. Exact total RTP remains finite even when the retrigger factor is 1 or higher.
                    </Text>
                </Alert>
            )}
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
                            <Table.Th>Scatters on screen (exact)</Table.Th>
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
                                        aria-label={`${count} scatters free games awarded`}
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
                                        itemLabel={`${count} scatters free games award`}
                                        onRemove={() => mutate((b) => removeFreeGamesAward(b, Number(count)))}
                                    />
                                </Table.Td>
                            </Table.Tr>
                        ))}
                    </Table.Tbody>
                </Table>
            </Table.ScrollContainer>
            <QuickActions>
                <NumberInput aria-label="New match count" placeholder="Match count" min={1} step={1} value={newMatchCount} onChange={setNewMatchCount} />
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
