import {TextInput, type TextInputProps} from "@mantine/core";
import {useEffect, useState} from "react";

// A controlled TextInput that only commits (calls onCommit) on blur -- same "commit on change/blur, not
// every keystroke" semantics as the old app's own `change`-event listeners -- while staying visually
// correct after the underlying array it belongs to is reordered/had an item removed (an uncontrolled
// defaultValue input keyed by array index would otherwise keep showing a stale value once React reuses
// its DOM node at a shifted index; see the Blueprint Editor's own dynamic list rows).
export function BufferedTextInput({
    value,
    onCommit,
    ...rest
}: Omit<TextInputProps, "value" | "onChange" | "onBlur"> & {value: string; onCommit: (value: string) => void}) {
    const [draft, setDraft] = useState(value);
    useEffect(() => {
        setDraft(value);
    }, [value]);

    return <TextInput {...rest} value={draft} onChange={(event) => setDraft(event.currentTarget.value)} onBlur={() => onCommit(draft)} />;
}
