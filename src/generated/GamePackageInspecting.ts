import type {GamePackageInspectionReport} from "./GamePackageInspectionReport.js";

export interface GamePackageInspecting {
    inspect(packageRoot: string): GamePackageInspectionReport;
}
