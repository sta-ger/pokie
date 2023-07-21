export interface ConvertableToMatrix<T = string> {
    toMatrix(transposed?: boolean): T[][];
}
