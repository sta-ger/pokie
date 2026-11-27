import {SegmentedControl, Stack, Text} from "@mantine/core";
import {MECHANIC_PRESET_DESCRIPTION, MECHANIC_PRESET_LABELS, type MechanicStartingPreset} from "../../domain/mechanicPresets";

/**
 * One consistent producer choice before a mechanic is added. The selected preset only supplies
 * starting numbers; the ordinary fields remain editable and exact math/simulation remain the proof.
 */
export function MechanicPresetSelect({
    mechanic,
    value,
    onChange,
    description,
}: {
    mechanic: string;
    value: MechanicStartingPreset;
    onChange: (preset: MechanicStartingPreset) => void;
    description?: string;
}) {
    return (
        <Stack gap={4} data-pokie-mechanic-preset={mechanic}>
            <Text size="sm" fw={600}>Starting preset</Text>
            <SegmentedControl
                size="xs"
                fullWidth
                value={value}
                onChange={(next) => onChange(next === "conservative" || next === "generous" ? next : "safe")}
                data={[
                    {label: MECHANIC_PRESET_LABELS.safe, value: "safe"},
                    {label: MECHANIC_PRESET_LABELS.conservative, value: "conservative"},
                    {label: MECHANIC_PRESET_LABELS.generous, value: "generous"},
                ]}
            />
            <Text size="xs" c="dimmed">{description ?? MECHANIC_PRESET_DESCRIPTION}</Text>
        </Stack>
    );
}
