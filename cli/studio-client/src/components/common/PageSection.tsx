import {Fieldset} from "@mantine/core";
import type {ReactNode} from "react";

export function PageSection({id, legend, children}: {id?: string; legend: string; children: ReactNode}) {
    return (
        <Fieldset id={id} legend={legend} mb="md">
            {children}
        </Fieldset>
    );
}
