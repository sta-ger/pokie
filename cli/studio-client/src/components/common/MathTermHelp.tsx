import {Anchor, Tooltip} from "@mantine/core";
import {IconInfoCircle} from "@tabler/icons-react";
import {Link} from "react-router-dom";

/**
 * A small inline glossary hook for the numbers a producer reads first. The full definition stays one
 * click away; the tooltip gives the one-sentence version without making every label a paragraph.
 */
export function MathTermHelp({term, children}: {term: string; children: string}) {
    return (
        <Tooltip label={children} multiline w={320} withArrow>
            <Anchor
                component={Link}
                to="/docs/glossary"
                c="dimmed"
                aria-label={`Glossary: ${term}`}
                data-pokie-glossary-term={term}
                style={{display: "inline-flex", verticalAlign: "middle", marginLeft: 4}}
            >
                <IconInfoCircle size={13} aria-hidden />
            </Anchor>
        </Tooltip>
    );
}
