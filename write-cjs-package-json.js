import fs from "fs-extra";

// The root package.json sets "type": "module", so without this file Node would treat every
// .js file under dist/cjs as ESM (the nearest ancestor package.json wins), breaking require().
// It also needs its own "name"+"exports" so internal `from "pokie"` self-references (used
// throughout src/ instead of relative paths) keep resolving here rather than falling through
// to the root package.json's ESM "exports" condition.
fs.writeFileSync(
    "./dist/cjs/package.json",
    JSON.stringify(
        {
            name: "pokie",
            type: "commonjs",
            exports: {
                ".": "./index.js",
            },
        },
        null,
        4,
    ) + "\n",
);
