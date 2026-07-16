import {NumberInput, type NumberInputProps} from "@mantine/core";
import {useEffect, useState} from "react";

// NumberInput counterpart to BufferedTextInput -- same commit-on-blur semantics, same fix for staying
// visually correct after the underlying array is reordered/had an item removed.
export function BufferedNumberInput({
    value,
    onCommit,
    ...rest
}: Omit<NumberInputProps, "value" | "onChange" | "onBlur"> & {value: number | string; onCommit: (value: number) => void}) {
    const [draft, setDraft] = useState<number | string>(value);
    useEffect(() => {
        setDraft(value);
    }, [value]);

    return (
        <NumberInput
            {...rest}
            value={draft}
            onChange={setDraft}
            onBlur={() => {
                const parsed = Number(draft);
                if (Number.isFinite(parsed)) {
                    onCommit(parsed);
                }
            }}
        />
    );
}
