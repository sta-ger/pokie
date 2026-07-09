import {PokieGamePackageValidationReport} from "pokie";

export interface PokieGamePackageValidating {
    validate(packageRoot: string): Promise<PokieGamePackageValidationReport>;
}
