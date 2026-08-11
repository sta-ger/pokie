import {Button, Textarea} from "@mantine/core";
import {useEffect, useState} from "react";
import {ErrorState} from "../common/ErrorState";
import {QuickActions} from "../common/QuickActions";

// Controlled (not `defaultValue`) on purpose: an uncontrolled textarea kept every keystroke only in the
// DOM itself, invisible to this editor's own dirty-tracking, so a typed-but-never-applied replacement
// blueprint was silently discarded the moment the mode toggle unmounted this panel -- no revision bump,
// no isDirty, no warning of any kind. `dirty` (live text vs. the last value this editor actually knows
// about, `jsonText`) is derived every render and reported to the parent via `onDraftDirtyChange`, which
// folds it into the same `isDirty` this page already gates New/navigation/beforeunload on -- see
// BlueprintEditorPage's own jsonDraftDirty wiring.
export function BlueprintJsonPanel({
    jsonText,
    jsonError,
    onApply,
    onDraftDirtyChange,
}: {
    jsonText: string;
    jsonError?: string;
    onApply: (text: string) => void;
    onDraftDirtyChange?: (dirty: boolean) => void;
}) {
    const [value, setValue] = useState(jsonText);
    const dirty = value !== jsonText;

    useEffect(() => {
        onDraftDirtyChange?.(dirty);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [dirty]);

    return (
        <div>
            <Textarea
                label="Blueprint JSON"
                rows={24}
                value={value}
                onChange={(event) => setValue(event.currentTarget.value)}
                spellCheck={false}
                style={{fontFamily: "monospace"}}
            />
            <QuickActions>
                <Button variant="default" onClick={() => onApply(value)}>
                    Apply JSON
                </Button>
            </QuickActions>
            {jsonError && <ErrorState message={jsonError} />}
        </div>
    );
}
