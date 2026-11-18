import {MantineProvider} from "@mantine/core";
import {render, screen} from "@testing-library/react";
import {DocumentationLinks} from "../../../../../../cli/studio-client/src/components/home/DocumentationLinks";

it("links Home documentation to the repository docs", () => {
    render(
        <MantineProvider>
            <DocumentationLinks />
        </MantineProvider>,
    );
    const docs = "https://github.com/sta-ger/pokie/tree/develop/docs";
    const expected = [
        ["Documentation", docs],
        ["Getting started", `${docs}/getting-started.md`],
        ["CLI reference", `${docs}/cli.md`],
        ["Example games", "https://github.com/sta-ger/pokie-examples"],
    ];
    for (const [name, href] of expected) {
        const link = screen.getByRole("link", {name});
        expect(link).toHaveAttribute("href", href);
        expect(link).toHaveAttribute("target", "_blank");
        expect(link).toHaveAttribute("rel", "noreferrer");
    }
    expect(screen.getAllByRole("link")).toHaveLength(expected.length);
});
