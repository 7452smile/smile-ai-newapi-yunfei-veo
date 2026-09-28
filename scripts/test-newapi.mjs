import { mkdtemp, readFile, writeFile, copyFile, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

// Compile an isolated test module against a local NewAPI checkout. Never edit
// that checkout, start the gateway, load .env files or contact an upstream.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const argument = process.argv[2];
if (!argument) throw new Error("Usage: node scripts/test-newapi.mjs /path/to/new-api");
const source = await realpath(resolve(argument));
const scratch = await mkdtemp(join(tmpdir(), "smile-yunfei-host-test-"));
try {
  const original = await readFile(join(source, "go.mod"), "utf8");
  const moduleText = original
    .replace(/^module\s+\S+/m, "module smile-yunfei-host-compat")
    .replace(/replace github\.com\/QuantumNous\/new-api\/relaykit => \.\/relaykit/, "replace github.com/QuantumNous/new-api/relaykit => " + JSON.stringify(join(source, "relaykit")));
  await writeFile(join(scratch, "go.mod"), moduleText + "\nrequire github.com/QuantumNous/new-api v0.0.0\nreplace github.com/QuantumNous/new-api => " + JSON.stringify(source) + "\n");
  await copyFile(join(source, "go.sum"), join(scratch, "go.sum"));
  await copyFile(join(repo, "test/host/newapi_test.go"), join(scratch, "newapi_test.go"));
  const status = await new Promise((accept, reject) => {
    const child = spawn("go", ["test", "-mod=mod", "-count=1", "-v", "."], {
      cwd: scratch,
      stdio: "inherit",
      env: { ...process.env, GOWORK: "off", SMILE_PLUGIN_SOURCE: join(repo, "plugin.js"), SMILE_NEWAPI_SOURCE: source },
    });
    child.once("error", reject);
    child.once("close", code => accept(code ?? 1));
  });
  process.exitCode = status;
} finally {
  await rm(scratch, { recursive: true, force: true });
}
