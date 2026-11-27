import {Alert, Button, NumberInput, Select, Text} from "@mantine/core";
import type {BlueprintMutate} from "../../hooks/useBlueprintEditor";
import {PageSection} from "../common/PageSection";

type WinModelType = "lines" | "ways" | "clusters";

type WinModelSelection = {type: WinModelType; minimumClusterSize?: number};

function readWinModel(blueprint: Record<string, unknown>): WinModelSelection {
    const raw = blueprint.winModel;
    if (raw !== null && typeof raw === "object" && !Array.isArray(raw)) {
        const record = raw as Record<string, unknown>;
        if (record.type === "lines" || record.type === "ways" || record.type === "clusters") {
            const minimum = record.minimumClusterSize;
            return {
                type: record.type,
                ...(typeof minimum === "number" && Number.isFinite(minimum) ? {minimumClusterSize: minimum} : {}),
            };
        }
    }
    // A Blueprint with no authored win model uses the engine's line default.
    return {type: "lines"};
}

function hasPaylines(blueprint: Record<string, unknown>): boolean {
    return Array.isArray(blueprint.paylines) && blueprint.paylines.length > 0;
}

function hasPaytable(blueprint: Record<string, unknown>): boolean {
    const paytable = blueprint.paytable;
    return paytable !== null && typeof paytable === "object" && !Array.isArray(paytable) && Object.keys(paytable).length > 0;
}

/** True for the engine's default/line model, including a Blueprint that never authored `winModel`. */
export function isLineWinModel(blueprint: Record<string, unknown>): boolean {
    return readWinModel(blueprint).type === "lines";
}

/**
 * The one field the Layout section was missing: which win evaluator this design actually uses.
 * Ways and cluster models deliberately ignore paylines, so an authored line set is kept (switching
 * back to Lines should not lose it) but called out with an explicit way to remove it.
 */
export function WinModelFieldset({blueprint, mutate}: {blueprint: Record<string, unknown>; mutate: BlueprintMutate}) {
    const winModel = readWinModel(blueprint);
    const setType = (type: WinModelType): void => mutate((draft) => {
        if (type === "clusters") {
            draft.winModel = {type, minimumClusterSize: winModel.minimumClusterSize ?? 5};
            return;
        }
        draft.winModel = {type};
    });

    return (
        <PageSection legend="Win model">
            <Text size="sm" c="dimmed" mb="sm">
                Lines pays along fixed paylines. Ways pays matching symbols on adjacent reels. Clusters pays connected groups of matching symbols anywhere on the screen.
            </Text>
            <Select
                label="Win model"
                data={[
                    {value: "lines", label: "Lines — fixed paylines"},
                    {value: "ways", label: "Ways — adjacent reels"},
                    {value: "clusters", label: "Clusters — connected groups"},
                ]}
                value={winModel.type}
                allowDeselect={false}
                onChange={(value) => {
                    if (value === "lines" || value === "ways" || value === "clusters") setType(value);
                }}
            />
            {winModel.type === "clusters" && (
                <NumberInput
                    label="Minimum cluster size"
                    description="The smallest connected group that pays. The engine default is 5."
                    min={2}
                    max={1024}
                    step={1}
                    value={winModel.minimumClusterSize ?? 5}
                    onChange={(value) => {
                        if (typeof value !== "number" || !Number.isInteger(value) || value < 2) return;
                        mutate((draft) => {
                            draft.winModel = {type: "clusters", minimumClusterSize: value};
                        });
                    }}
                    mt="sm"
                />
            )}
            {winModel.type !== "lines" && hasPaylines(blueprint) && hasPaytable(blueprint) && (
                <Alert
                    color="yellow"
                    variant="light"
                    title="Structural demo until you retune the paytable"
                    mt="sm"
                    data-pokie-win-model-demo-warning="true"
                >
                    <Text size="sm">
                        This design still has the line-game paytable. {winModel.type === "ways" ? "Ways" : "Clusters"} can
                        pay that same symbol value on many more combinations, so exact total RTP can jump far above the
                        line-game number. Calculate exact math, then retune the paytable or reels before treating this as
                        a balanced game.
                    </Text>
                </Alert>
            )}
            {winModel.type !== "lines" && hasPaylines(blueprint) && (
                <Alert color="yellow" variant="light" title="Paylines are not used by this win model" mt="sm">
                    <Text size="sm">
                        The existing paylines are kept so you can switch back to Lines, but {winModel.type} wins ignore them.
                    </Text>
                    <Button
                        variant="default"
                        size="xs"
                        mt="xs"
                        onClick={() => mutate((draft) => {
                            Reflect.deleteProperty(draft, "paylines");
                        })}
                    >
                        Remove unused paylines
                    </Button>
                </Alert>
            )}
        </PageSection>
    );
}
