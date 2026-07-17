import {Text} from "@mantine/core";

// A field-level warning note, rendered *next to* a Mantine input rather than through its own `error`
// prop -- `error` also sets `aria-invalid`, and a warning is never a reason to mark a field invalid (see
// BlueprintBuildPanel's own "warnings-only never blocks" contract; fieldErrorMessage/fieldWarningMessage
// in domain/interpret/BlueprintSections.ts keep the two channels strictly separate for the same reason).
export function FieldWarningText({message}: {message?: string}) {
    if (!message) {
        return null;
    }
    return (
        <Text size="xs" c="yellow.7" mt={2}>
            {message}
        </Text>
    );
}
