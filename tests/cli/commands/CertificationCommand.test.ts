import {
    CertificationPackVerifying,
    DEFAULT_CERTIFICATION_PACK_TEMPLATE,
    ProjectResolving,
} from "@fromstan/pokie";
import {CertificationCommand} from "../../../cli/commands/CertificationCommand.js";

function commandWith(verifier: CertificationPackVerifying, loadJson: (filePath: string) => unknown): CertificationCommand {
    const resolveProject = {resolve: () => Promise.resolve(undefined)} as unknown as ProjectResolving;
    return new CertificationCommand("2.0.0", undefined, verifier, loadJson, resolveProject);
}

describe("CertificationCommand verify template diagnostics", () => {
    it("names a malformed presentation template before verification runs", async () => {
        const verify = jest.fn();
        const command = commandWith({verify} as unknown as CertificationPackVerifying, () => {
            throw new Error("Expected property name or '}' in JSON at position 2");
        });

        await expect(command.run(["verify", "pack", "--source", "source", "--template", "bad-template.json"])).rejects.toThrow(
            'Could not read the presentation template file "bad-template.json": Expected property name or \'}\' in JSON at position 2. Check that the file exists and contains valid JSON, then retry.',
        );
        expect(verify).not.toHaveBeenCalled();
    });

    it("passes an explicitly validated template through to the verifier", async () => {
        const verify = jest.fn().mockResolvedValue([]);
        const command = commandWith({verify} as unknown as CertificationPackVerifying, () => DEFAULT_CERTIFICATION_PACK_TEMPLATE);

        await expect(command.run(["verify", "pack", "--source", "source", "--template", "template.json"])).resolves.toBe(0);
        expect(verify).toHaveBeenCalledWith("pack", expect.objectContaining({
            sourceLibraryDir: "source",
            templateFile: "template.json",
        }));
    });
});
