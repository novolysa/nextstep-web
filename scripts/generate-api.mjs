// Generates src/lib/api/schema.d.ts from the canonical contract in nextstep-contracts.
// `--check` fails when the checked-in types differ from the contract (contract drift).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import openapiTS, { astToString } from "openapi-typescript";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contract = path.resolve(root, process.env.CONTRACT_PATH ?? "../nextstep-contracts/openapi/v1/openapi.json");
const output = path.join(root, "src/lib/api/schema.d.ts");

const header = "// Generated from nextstep-contracts/openapi/v1/openapi.json by `pnpm generate:api`. Do not edit.\n";
const ast = await openapiTS(pathToFileURL(contract));
const generated = header + astToString(ast);

if (process.argv.includes("--check")) {
  const current = fs.existsSync(output) ? fs.readFileSync(output, "utf8") : "";
  if (current !== generated) {
    console.error("API types are out of date with the contract. Run `pnpm generate:api`.");
    process.exit(1);
  }
  console.log("API types match the canonical contract.");
} else {
  fs.writeFileSync(output, generated);
  console.log(`Wrote ${path.relative(root, output)}`);
}
