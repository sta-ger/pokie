import {ScrollArea} from "@mantine/core";
import type {CSSProperties} from "react";

const preStyle: CSSProperties = {
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflowWrap: "anywhere",
    margin: 0,
    fontSize: "var(--mantine-font-size-xs)",
    fontFamily: "var(--mantine-font-family-monospace)",
};

// Shared by the Runtime tab's public/debug JSON dumps and the Deployment tab's artifact content preview
// -- wraps long lines instead of forcing horizontal page scroll, and caps its own height (scrolling
// vertically past that) so a huge JSON blob or artifact never pushes the rest of the page down.
export function CodeBlock({children}: {children: string}) {
    return (
        <ScrollArea.Autosize mah={400} type="auto">
            <pre style={preStyle}>{children}</pre>
        </ScrollArea.Autosize>
    );
}
