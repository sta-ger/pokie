export function renderIndexModule(className: string): string {
    return `import {${className}Game} from "./${className}Game.js";

export default ${className}Game;
`;
}
