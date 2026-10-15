import {Button, Group, MultiSelect, NumberInput, Select, Stack, Text, TextInput} from "@mantine/core";
import type {ScreenModifierRule, ScreenModifiers} from "../../../../../src/session/videoslot/modifiers/ScreenModifiers";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {asStringList} from "../../domain/asStringList";
import {PageSection} from "../common/PageSection";

/** Only draft mutation here; the Home and Project hosts own explicit apply/save. */
export function WildModifiersFieldset({
    blueprint,
    mutate,
}: {
    blueprint: Record<string, unknown>;
    mutate: BlueprintMutate;
}) {
    const mechanics =
        blueprint.mechanics && typeof blueprint.mechanics === "object" && !Array.isArray(blueprint.mechanics)
            ? (blueprint.mechanics as Record<string, unknown>)
            : {};
    const raw = mechanics.modifiers;
    const symbols = asStringList(blueprint.symbols);
    const wilds = asStringList(blueprint.wilds);
    const set = (value: ScreenModifiers | undefined): void =>
        mutate((b) => {
            const next = {...mechanics};
            if (value === undefined) Reflect.deleteProperty(next, "modifiers");
            else next.modifiers = value;
            b.mechanics = next;
        });
    // Invalid JSON is retained and can always be repaired in JSON or removed explicitly.
    const editable = isEditable(raw);
    const data = raw as ScreenModifiers;
    const updateRule = (index: number, rule: ScreenModifierRule): void =>
        set({...data, rules: data.rules.map((previous, i) => (i === index ? rule : previous))});
    const addRule = (type: ScreenModifierRule["type"]): void => {
        let index = data.rules.length + 1;
        while (data.rules.some((rule) => rule.id === `rule-${index}`)) index++;
        const base = {id: `rule-${index}`, space: "evaluated" as const, positions: [[0, 0]] as [number, number][]};
        let rule: ScreenModifierRule;
        switch (type) {
            case "transform":
                rule = {...base, type, from: symbols[0], to: symbols[0]};
                break;
            case "sticky":
                rule = {...base, type, symbol: wilds[0], lifetime: 2};
                break;
            case "reel":
                rule = {...base, positions: [], type, symbol: symbols[0], reels: [0]};
                break;
            default:
                rule = {...base, type, symbol: wilds[0]};
        }
        set({...data, rules: [...data.rules, rule]});
    };
    return (
        <PageSection legend="Wilds and screen modifiers">
            <Text>
                Generate → ordered rules in the evaluated window → evaluate → product of winning wild factors →
                aggregate → settle. Sticky lifetime includes acquisition and advances once per executed step.
            </Text>
            {raw === undefined && <Button onClick={() => set({wilds: [], rules: []})}>Add wild modifiers</Button>}
            {raw !== undefined && <Button onClick={() => set(undefined)}>Remove wild modifiers</Button>}
            {raw !== undefined && !editable && (
                <Text>
                    The modifier draft is incomplete or malformed. Correct mechanics.modifiers in JSON and Apply JSON,
                    or remove it. Your draft is retained.
                </Text>
            )}
            {editable && (
                <Stack>
                    {wilds.map((symbol) => {
                        const wild = data.wilds.find((wild) => wild.symbol === symbol);
                        return (
                            <Stack key={symbol}>
                                <Select
                                    label={`${symbol} substitution policy`}
                                    data={["unrestricted", "restricted"]}
                                    value={wild?.substitutes === undefined ? "unrestricted" : "restricted"}
                                    onChange={(value) => {
                                        const next = {...wild, symbol};
                                        if (value === "restricted") next.substitutes = [];
                                        else Reflect.deleteProperty(next, "substitutes");
                                        set({
                                            ...data,
                                            wilds: [...data.wilds.filter((wild) => wild.symbol !== symbol), next],
                                        });
                                    }}
                                />
                                {wild?.substitutes !== undefined && (
                                    <MultiSelect
                                        label={`${symbol} substitution targets (empty forbids substitution)`}
                                        data={symbols}
                                        value={wild.substitutes}
                                        onChange={(substitutes) =>
                                            set({
                                                ...data,
                                                wilds: data.wilds.map((w) =>
                                                    w.symbol === symbol ? {...w, substitutes} : w,
                                                ),
                                            })
                                        }
                                    />
                                )}
                                <NumberInput
                                    label={`${symbol} multiplier factor`}
                                    min={0}
                                    value={wild?.factor ?? ""}
                                    placeholder="1 (no multiplier)"
                                    onChange={(value) => {
                                        const next = {...wild, symbol};
                                        if (value === "") Reflect.deleteProperty(next, "factor");
                                        else next.factor = Number(value);
                                        set({
                                            ...data,
                                            wilds: [...data.wilds.filter((wild) => wild.symbol !== symbol), next],
                                        });
                                    }}
                                />
                            </Stack>
                        );
                    })}
                    <Group>
                        {(["transform", "expand", "sticky", "reel"] as const).map((type) => (
                            <Button
                                key={type}
                                disabled={(type === "sticky" || type === "expand") && wilds.length === 0}
                                onClick={() => addRule(type)}
                            >
                                Add {type} rule
                            </Button>
                        ))}
                    </Group>
                    {data.rules.map((rule, index) => (
                        <PageSection key={index} legend={`Rule ${index + 1}: ${rule.type}`}>
                            <TextInput
                                label={`Rule ${index + 1} id`}
                                value={rule.id}
                                onChange={(e) => updateRule(index, {...rule, id: e.currentTarget.value})}
                            />
                            <Select
                                label={`Rule ${index + 1} coordinate space`}
                                data={rule.type === "reel" ? ["evaluated"] : ["evaluated", "visible", "generated"]}
                                value={rule.space}
                                onChange={(space) =>
                                    updateRule(index, {...rule, space: space as ScreenModifierRule["space"]})
                                }
                            />
                            {rule.type === "transform" ? (
                                <Group>
                                    <Select
                                        label={`Rule ${index + 1} source symbol`}
                                        data={symbols}
                                        value={rule.from}
                                        onChange={(from) => updateRule(index, {...rule, from: from ?? ""})}
                                    />
                                    <Select
                                        label={`Rule ${index + 1} target symbol`}
                                        data={symbols}
                                        value={rule.to}
                                        onChange={(to) => updateRule(index, {...rule, to: to ?? ""})}
                                    />
                                </Group>
                            ) : (
                                <Select
                                    label={`Rule ${index + 1} symbol`}
                                    data={rule.type === "reel" ? symbols : wilds}
                                    value={rule.symbol}
                                    onChange={(symbol) => updateRule(index, {...rule, symbol: symbol ?? ""})}
                                />
                            )}
                            {rule.type === "sticky" && (
                                <NumberInput
                                    label={`Rule ${index + 1} lifetime`}
                                    min={1}
                                    value={rule.lifetime}
                                    onChange={(lifetime) => updateRule(index, {...rule, lifetime: Number(lifetime)})}
                                />
                            )}
                            {rule.type === "reel" ? (
                                <MultiSelect
                                    label={`Rule ${index + 1} reels`}
                                    data={Array.from({length: Number(blueprint.reels)}, (_, i) => String(i))}
                                    value={rule.reels.map(String)}
                                    onChange={(reels) => updateRule(index, {...rule, reels: reels.map(Number)})}
                                />
                            ) : (
                                <Stack>
                                    {rule.positions.map((position, p) => (
                                        <Group key={p}>
                                            {(["reel", "row"] as const).map((axis, a) => (
                                                <NumberInput
                                                    key={axis}
                                                    label={`Rule ${index + 1} cell ${p + 1} ${axis}`}
                                                    min={0}
                                                    value={position[a]}
                                                    onChange={(value) =>
                                                        updateRule(index, {
                                                            ...rule,
                                                            positions: rule.positions.map((old, j) =>
                                                                j === p
                                                                    ? (old.map((v, k) =>
                                                                        k === a ? Number(value) : v,
                                                                    ) as [number, number])
                                                                    : old,
                                                            ),
                                                        })
                                                    }
                                                />
                                            ))}
                                            <Button
                                                onClick={() =>
                                                    updateRule(index, {
                                                        ...rule,
                                                        positions: rule.positions.filter((_, j) => j !== p),
                                                    })
                                                }
                                            >
                                                Remove cell {p + 1} from rule {index + 1}
                                            </Button>
                                        </Group>
                                    ))}
                                    <Button
                                        onClick={() =>
                                            updateRule(index, {...rule, positions: [...rule.positions, [0, 0]]})
                                        }
                                    >
                                        Add cell to rule {index + 1}
                                    </Button>
                                </Stack>
                            )}
                            <Group>
                                <Button
                                    disabled={index === 0}
                                    onClick={() => {
                                        const rules = [...data.rules];
                                        [rules[index - 1], rules[index]] = [rules[index], rules[index - 1]];
                                        set({...data, rules});
                                    }}
                                >
                                    Move rule {index + 1} up
                                </Button>
                                <Button
                                    disabled={index === data.rules.length - 1}
                                    onClick={() => {
                                        const rules = [...data.rules];
                                        [rules[index + 1], rules[index]] = [rules[index], rules[index + 1]];
                                        set({...data, rules});
                                    }}
                                >
                                    Move rule {index + 1} down
                                </Button>
                                <Button onClick={() => set({...data, rules: data.rules.filter((_, i) => i !== index)})}>
                                    Remove rule {index + 1}
                                </Button>
                            </Group>
                        </PageSection>
                    ))}
                </Stack>
            )}
        </PageSection>
    );
}

function isEditable(value: unknown): value is ScreenModifiers {
    if (!value || typeof value !== "object" || Array.isArray(value)) return false;
    const data = value as ScreenModifiers;
    return (
        Array.isArray(data.wilds) &&
        data.wilds.every(
            (wild) =>
                wild &&
                typeof wild.symbol === "string" &&
                (wild.substitutes === undefined ||
                    (Array.isArray(wild.substitutes) && wild.substitutes.every((s) => typeof s === "string"))),
        ) &&
        Array.isArray(data.rules) &&
        data.rules.every(
            (rule) =>
                rule &&
                typeof rule.id === "string" &&
                typeof rule.space === "string" &&
                Array.isArray(rule.positions) &&
                rule.positions.every(
                    (p) => Array.isArray(p) && p.length === 2 && p.every((n) => typeof n === "number"),
                ) &&
                (rule.type === "transform"
                    ? typeof rule.from === "string" && typeof rule.to === "string"
                    : typeof rule.symbol === "string" &&
                      (rule.type === "expand" ||
                          (rule.type === "sticky" && typeof rule.lifetime === "number") ||
                          (rule.type === "reel" && Array.isArray(rule.reels)))),
        )
    );
}
