import {Button, NumberInput, Select, Stack, Text, TextInput} from "@mantine/core";
import type {WeightedBonus} from "../../../../../src/session/videoslot/authored/WeightedBonus";
import {asStringList} from "../../domain/asStringList";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {PageSection} from "../common/PageSection";

/** Recoverable shared draft; explicit save/build ownership belongs to the enclosing editor. */
export function WeightedBonusFieldset({
    blueprint,
    mutate,
}: {
    blueprint: Record<string, unknown>;
    mutate: BlueprintMutate;
}) {
    const object = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
    const raw = object(blueprint.mechanics) ? blueprint.mechanics.weightedBonus : undefined;
    const symbols = asStringList(blueprint.symbols);
    const set = (value: unknown): void =>
        mutate((b) => {
            const mechanics = object(b.mechanics) ? {...b.mechanics} : {};
            if (value === undefined) Reflect.deleteProperty(mechanics, "weightedBonus");
            else mechanics.weightedBonus = value;
            b.mechanics = mechanics;
        });
    const defaults: WeightedBonus = {
        id: "bonus",
        context: "triggered-paid-entry",
        trigger: {symbolId: symbols[0] ?? "", minimumCount: 1},
        feature: {id: "bonus-respins", type: "bonus-respins", maxDuration: 10},
        outcomes: [
            {id: "small", weight: 1, targetId: "bonus-respins", payout: 1, payoutUnits: "bet-multiple", duration: 0},
            {id: "large", weight: 3, targetId: "bonus-respins", payout: 5, payoutUnits: "bet-multiple", duration: 2},
        ],
    };
    const numericValue = (v: unknown): boolean => typeof v === "number" || typeof v === "string";
    const validShape =
        object(raw) &&
        typeof raw.id === "string" &&
        raw.context === "triggered-paid-entry" &&
        object(raw.trigger) &&
        typeof raw.trigger.symbolId === "string" &&
        numericValue(raw.trigger.minimumCount) &&
        object(raw.feature) &&
        typeof raw.feature.id === "string" &&
        raw.feature.type === "bonus-respins" &&
        numericValue(raw.feature.maxDuration) &&
        Array.isArray(raw.outcomes) &&
        raw.outcomes.every(
            (o) =>
                object(o) &&
                typeof o.id === "string" &&
                numericValue(o.weight) &&
                numericValue(o.payout) &&
                numericValue(o.duration) &&
                typeof o.targetId === "string" &&
                (o.payoutUnits === "currency" || o.payoutUnits === "bet-multiple"),
        );
    const table = raw as WeightedBonus;
    const numeric = (label: string, value: number, change: (value: unknown) => void) => (
        <NumberInput label={label} value={value} onChange={change} />
    );
    const outcome = (index: number, patch: Record<string, unknown>): void =>
        set({...table, outcomes: table.outcomes.map((o, i) => (i === index ? {...o, ...patch} : o))});
    return (
        <PageSection legend="Weighted bonus outcomes">
            {raw === undefined ? (
                <Button onClick={() => set(defaults)}>Add weighted bonus</Button>
            ) : (
                <Stack>
                    {!validShape ? (
                        <Text>
                            Correct mechanics.weightedBonus in JSON and Apply JSON. The current draft is retained.
                        </Text>
                    ) : (
                        <>
                            <TextInput
                                label="Bonus table ID"
                                value={table.id}
                                onChange={(e) => set({...table, id: e.currentTarget.value})}
                            />
                            <Select
                                label="Bonus trigger symbol"
                                data={symbols}
                                value={table.trigger.symbolId}
                                onChange={(symbolId) =>
                                    set({...table, trigger: {...table.trigger, symbolId: symbolId ?? ""}})
                                }
                            />
                            {numeric("Bonus trigger count", table.trigger.minimumCount, (minimumCount) =>
                                set({...table, trigger: {...table.trigger, minimumCount}}),
                            )}
                            <TextInput
                                label="Bonus feature ID"
                                value={table.feature.id}
                                onChange={(e) => {
                                    const id = e.currentTarget.value;
                                    set({
                                        ...table,
                                        feature: {...table.feature, id},
                                        outcomes: table.outcomes.map((o) =>
                                            o.targetId === table.feature.id ? {...o, targetId: id} : o,
                                        ),
                                    });
                                }}
                            />
                            {numeric("Maximum bonus duration", table.feature.maxDuration, (maxDuration) =>
                                set({...table, feature: {...table.feature, maxDuration}}),
                            )}
                            {table.outcomes.map((o, index) => (
                                <PageSection key={index} legend={`Bonus outcome ${index + 1}`}>
                                    <TextInput
                                        label={`Outcome ${index + 1} ID`}
                                        value={o.id}
                                        onChange={(e) => outcome(index, {id: e.currentTarget.value})}
                                    />
                                    {numeric(`Outcome ${index + 1} weight`, o.weight, (weight) =>
                                        outcome(index, {weight}),
                                    )}
                                    <TextInput
                                        label={`Outcome ${index + 1} target`}
                                        value={o.targetId}
                                        onChange={(e) => outcome(index, {targetId: e.currentTarget.value})}
                                    />
                                    {numeric(`Outcome ${index + 1} payout`, o.payout, (payout) =>
                                        outcome(index, {payout}),
                                    )}
                                    <Select
                                        label={`Outcome ${index + 1} payout units`}
                                        data={["currency", "bet-multiple"]}
                                        value={o.payoutUnits}
                                        onChange={(payoutUnits) => outcome(index, {payoutUnits})}
                                    />
                                    {numeric(`Outcome ${index + 1} duration`, o.duration, (duration) =>
                                        outcome(index, {duration}),
                                    )}
                                    <Button
                                        onClick={() =>
                                            set({...table, outcomes: table.outcomes.filter((_, i) => i !== index)})
                                        }
                                    >
                                        Remove outcome {index + 1}
                                    </Button>
                                </PageSection>
                            ))}
                            <Button
                                onClick={() =>
                                    set({
                                        ...table,
                                        outcomes: [
                                            ...table.outcomes,
                                            {
                                                id: `outcome-${table.outcomes.length + 1}`,
                                                weight: 0,
                                                targetId: table.feature.id,
                                                payout: 0,
                                                payoutUnits: "currency",
                                                duration: 0,
                                            },
                                        ],
                                    })
                                }
                            >
                                Add bonus outcome
                            </Button>
                            <Text>
                                Select once on a triggered paid entry. Bonus respins cost zero, retain entry bet, pay
                                the normal evaluator and never retrigger. Duration excludes the entry. Weight zero
                                remains visible; total integer weight must be at most 2³².
                            </Text>
                        </>
                    )}
                    <Button onClick={() => set(undefined)}>Remove weighted bonus</Button>
                </Stack>
            )}
        </PageSection>
    );
}
