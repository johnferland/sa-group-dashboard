import fs from "node:fs";
import { syncGoogleMetrics } from "../lib/integrations/sync-google";

function loadEnvLocal() {
  const contents = fs.readFileSync(".env.local", "utf8");
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim();
  }
}

async function main() {
  loadEnvLocal();
  const result = await syncGoogleMetrics(14);
  console.log(JSON.stringify(result, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
