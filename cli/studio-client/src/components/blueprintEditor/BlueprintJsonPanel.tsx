import {Button, Textarea} from "@mantine/core";
import {useRef} from "react";
import {ErrorState} from "../common/ErrorState";
import {QuickActions} from "../common/QuickActions";

export function BlueprintJsonPanel({jsonText, jsonError, onApply}: {jsonText: string; jsonError?: string; onApply: (text: string) => void}) {
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    return (
        <div>
            <Textarea ref={textareaRef} label="Blueprint JSON" rows={24} defaultValue={jsonText} spellCheck={false} style={{fontFamily: "monospace"}} />
            <QuickActions>
                <Button variant="default" onClick={() => onApply(textareaRef.current?.value ?? "")}>
                    Apply JSON
                </Button>
            </QuickActions>
            {jsonError && <ErrorState message={jsonError} />}
        </div>
    );
}
