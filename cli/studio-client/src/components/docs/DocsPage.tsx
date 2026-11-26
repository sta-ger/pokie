import {Anchor, List, Text, Title} from "@mantine/core";
import {useEffect, useMemo, useState} from "react";
import {Link, useParams} from "react-router-dom";
import {renderMarkdownToHtml} from "../../domain/markdown";

const sources = import.meta.glob("../../../../../docs/*.md", {query: "?raw", import: "default"}) as Record<string, () => Promise<string>>;

function slugOf(filePath: string): string {
    return filePath.split("/").pop()?.replace(/\.md$/i, "") ?? "README";
}

function titleOf(slug: string): string {
    if (slug === "README") return "Documentation";
    if (slug === "cli") return "CLI reference";
    if (slug === "getting-started") return "Getting started";
    return slug.replace(/-/g, " ").replace(/^./, (letter) => letter.toUpperCase());
}

const DOCUMENTS = Object.entries(sources)
    .map(([filePath, load]) => ({slug: slugOf(filePath), title: titleOf(slugOf(filePath)), load}))
    .sort((left, right) => {
        if (left.slug === "README") return -1;
        if (right.slug === "README") return 1;
        return left.title.localeCompare(right.title);
    });

export function DocsPage() {
    const {doc = "README"} = useParams<{doc: string}>();
    const selected = DOCUMENTS.find((entry) => entry.slug.toLowerCase() === doc.toLowerCase()) ?? DOCUMENTS[0];
    const [source, setSource] = useState<string>();

    useEffect(() => {
        let current = true;
        setSource(undefined);
        selected.load()
            .then((markdown) => {
                if (current) setSource(markdown);
            })
            .catch(() => {
                if (current) setSource("# Documentation unavailable\n\nThe included document could not be loaded.");
            });
        return () => {
            current = false;
        };
    }, [selected]);

    const html = useMemo(() => (source === undefined ? "" : renderMarkdownToHtml(source)), [source]);

    return (
        <div className="studio-page docs-page">
            <Text size="sm" mb="xs">
                <Anchor component={Link} to="/home/design">← Back to Studio</Anchor>
            </Text>
            <Title order={2}>POKIE documentation</Title>
            <Text size="sm" c="dimmed" mb="sm">
                Bundled with this installation, so it works offline and matches the installed version.
            </Text>
            <List size="sm" mb="lg">
                {DOCUMENTS.map((entry) => (
                    <List.Item key={entry.slug}>
                        <Anchor component={Link} to={`/docs/${entry.slug}`} fw={entry.slug === selected.slug ? 600 : undefined}>
                            {entry.title}
                        </Anchor>
                    </List.Item>
                ))}
                <List.Item>
                    <Anchor href="https://github.com/sta-ger/pokie-examples" target="_blank" rel="noreferrer">
                        Example games
                    </Anchor>
                </List.Item>
            </List>
            {source === undefined
                ? <Text size="sm" c="dimmed">Loading documentation…</Text>
                : <div className="docs-content" dangerouslySetInnerHTML={{__html: html}} />}
        </div>
    );
}
