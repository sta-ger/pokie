import {Fieldset} from "@mantine/core";
import type {ReactNode} from "react";

export function PageSection({legend, children}: {legend: string; children: ReactNode}) {
    return (
        <Fieldset legend={legend} mb="md">
            {children}
        </Fieldset>
    );
}
