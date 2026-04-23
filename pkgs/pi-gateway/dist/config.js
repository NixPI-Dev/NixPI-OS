import { readFileSync } from "node:fs";
import YAML from "yaml";
export function loadConfig(path) {
    const raw = readFileSync(path, "utf-8");
    return YAML.parse(raw);
}
//# sourceMappingURL=config.js.map