import fs from "fs-extra";
import path from "path";

const sourceDirectory = "./src";

const outputFile = "./src/index.ts";

function scanDirectory(directory) {
    const files = fs.readdirSync(directory);

    files.forEach((file) => {
        const filePath = path.join(directory, file);
        const stat = fs.statSync(filePath);

        if (stat.isDirectory()) {
            scanDirectory(filePath);
        } else if (file !== "index.ts" && path.extname(file) === ".ts") {
            const fPath = path.relative(sourceDirectory, filePath).replace(".ts", ".js");
            const exportStatement = `export * from "./${fPath}";\n`;
            fs.appendFileSync(outputFile, exportStatement);
        }
    });
}

fs.writeFileSync(outputFile, "");

scanDirectory(sourceDirectory);
