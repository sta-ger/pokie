import jestConfigIgnore from "./jest.config.ignore.mjs";
export default {
    coveragePathIgnorePatterns: [...jestConfigIgnore],
    collectCoverageFrom: ["./src/**/*.ts"],
    collectCoverage: true,
    preset: "ts-jest",
    moduleFileExtensions: ["ts", "js"],
    moduleNameMapper: {
        pokie: "<rootDir>/src/index.ts",
        "^(\\.\\.?\\/.+)\\.jsx?$": "$1",
    },
};
