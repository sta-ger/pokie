import {Fieldset} from "@mantine/core";
import type {ReactNode} from "react";

export function PageSection({id, legend, hidden, children}: {id?: string; legend: string; hidden?: boolean; children: ReactNode}) {
    return (
        <Fieldset id={id} legend={legend} hidden={hidden} mb="md">
            {children}
        </Fieldset>
    );
}
