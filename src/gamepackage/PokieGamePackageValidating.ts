import type {PokieGamePackageValidationReport} from "./PokieGamePackageValidationReport.js";

export interface PokieGamePackageValidating {
    validate(packageRoot: string): Promise<PokieGamePackageValidationReport>;
}
