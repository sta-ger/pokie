import {Alert} from "@mantine/core";
import {IconCheck} from "@tabler/icons-react";
import type {ReactNode} from "react";

export function SuccessResult({message, children}: {message: string; children?: ReactNode}) {
    return (
        <Alert color="green" variant="light" icon={<IconCheck size={16} />} title={message} role="status" aria-live="polite" style={{overflowWrap: "anywhere"}}>
            {children}
        </Alert>
    );
}
