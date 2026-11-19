// Jest's CommonJS test transform cannot load the ESM-only ExcelJS replacement. Resolve the
// installed file directly and let Node's native require load it, bypassing Jest's ESM loader.
// The explicit default export keeps TypeScript's CommonJS import interop working under Jest.
const {createRequire} = require("node:module");
const path = require("node:path");

const exceljs = createRequire(__filename)(
    path.join(__dirname, "..", "..", "node_modules", "exceljs", "dist", "index.js"),
);

module.exports = {__esModule: true, default: exceljs, ...exceljs};
