import {Badge, Button, Group, Modal, NumberInput, Stack, Text} from "@mantine/core";
import {useState} from "react";
import {
    describeVolatilityBand,
    formatVolatilityBands,
    parseVolatilityBands,
    type VolatilityBand,
} from "../../domain/volatilityBands";
import {useVolatilityBands} from "../../hooks/useVolatilityBands";

const BAND_COLOR: Record<VolatilityBand, string> = {
    Low: "teal",
    Medium: "yellow",
    High: "red",
};

/**
 * A small label that only appears after the author defines portfolio boundaries. Studio deliberately
 * never assigns an industry-wide low/medium/high class on its own.
 */
export function VolatilityBandBadge({value, size = "sm", basis}: {value: number | undefined; size?: "xs" | "sm" | "md"; basis?: "paid-spin volatility" | "whole-round volatility"}) {
    const {bands} = useVolatilityBands();
    const band = value === undefined ? undefined : describeVolatilityBand(value, bands);
    if (band === undefined) return null;
    const scope = basis === undefined ? "the displayed standard deviation" : basis;
    return (
        <Badge
            color={BAND_COLOR[band]}
            variant="light"
            size={size}
            tt="none"
            data-pokie-volatility-band={band.toLowerCase()}
            data-pokie-volatility-basis={basis}
            title={`This is your portfolio's own band for ${scope}, not an industry-wide standard.`}
        >
            {band}
        </Badge>
    );
}

/**
 * Visible authoring control for the portfolio bands used by VolatilityBandBadge. The modal is the only
 * place Studio writes these thresholds; clearing it returns every card to a plain standard deviation.
 */
export function VolatilityBandsControl({compact = false}: {compact?: boolean}) {
    const {bands, save, clear} = useVolatilityBands();
    const [opened, setOpened] = useState(false);
    const [lowMax, setLowMax] = useState<number | string>(bands?.lowMax ?? 2);
    const [mediumMax, setMediumMax] = useState<number | string>(bands?.mediumMax ?? 5);
    const [error, setError] = useState<string>();
    const [syncError, setSyncError] = useState<string>();
    const [saving, setSaving] = useState(false);

    const open = (): void => {
        setLowMax(bands?.lowMax ?? 2);
        setMediumMax(bands?.mediumMax ?? 5);
        setError(undefined);
        setOpened(true);
    };

    const submit = (): void => {
        const candidate = parseVolatilityBands({
            lowMax: typeof lowMax === "number" ? lowMax : Number(lowMax),
            mediumMax: typeof mediumMax === "number" ? mediumMax : Number(mediumMax),
        });
        if (candidate === undefined) {
            setError("Enter two non-negative numbers with the medium boundary above the low boundary.");
            return;
        }
        setSaving(true);
        setSyncError(undefined);
        save(candidate)
            .then(() => setOpened(false))
            .catch(() => setError("Studio could not save these bands. Try again."))
            .finally(() => setSaving(false));
    };

    const clearBands = (): void => {
        setSyncError(undefined);
        clear().catch(() => setSyncError("Studio could not clear the saved bands. Try again."));
    };

    return (
        <>
            <Group gap="xs" wrap="wrap" data-pokie-volatility-bands-control="true">
                <Text size={compact ? "xs" : "sm"} c="dimmed">
                    {bands === undefined
                        ? "Volatility bands are optional: set your portfolio's Low/Medium/High boundaries."
                        : `Portfolio volatility bands: ${formatVolatilityBands(bands)}`}
                </Text>
                <Button variant="subtle" size={compact ? "compact-xs" : "xs"} onClick={open}>
                    {bands === undefined ? "Set portfolio bands" : "Edit bands"}
                </Button>
                {bands !== undefined && (
                    <Button variant="subtle" color="gray" size={compact ? "compact-xs" : "xs"} onClick={clearBands}>
                        Clear
                    </Button>
                )}
            </Group>
            {syncError !== undefined && (
                <Text size="xs" c="red" role="alert" mt={4}>{syncError}</Text>
            )}
            <Modal opened={opened} onClose={() => setOpened(false)} title="Portfolio volatility bands" centered>
                <Stack gap="sm">
                    <Text size="sm" c="dimmed">
                        These are your team&apos;s reference boundaries for the standard deviation shown as
                        volatility (σ, × bet). They label paid-spin and whole-round volatility separately wherever
                        Studio shows them. They are not an industry-wide scale and do not change the game&apos;s math.
                        Studio stores them on this computer, not inside the game design.
                    </Text>
                    <NumberInput
                        label="Low is below"
                        description="Values below this are labelled Low."
                        min={0}
                        step={0.1}
                        decimalScale={2}
                        value={lowMax}
                        onChange={setLowMax}
                    />
                    <NumberInput
                        label="Medium is up to"
                        description="Values from the low boundary through this value are labelled Medium."
                        min={0}
                        step={0.1}
                        decimalScale={2}
                        value={mediumMax}
                        onChange={setMediumMax}
                    />
                    {error !== undefined && (
                        <Text size="sm" c="red" role="alert">
                            {error}
                        </Text>
                    )}
                    <Group justify="flex-end">
                        <Button variant="default" onClick={() => setOpened(false)}>
                            Cancel
                        </Button>
                        <Button onClick={submit} loading={saving} disabled={saving}>Save bands</Button>
                    </Group>
                </Stack>
            </Modal>
        </>
    );
}
