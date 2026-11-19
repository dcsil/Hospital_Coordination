import { readFile, writeFile, rename } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { fitOffloadModels } from '../../lib/offload-model.ts';
const [input, asOf] = process.argv.slice(2);
if (!input || !asOf) throw new Error('Usage: node --experimental-strip-types scripts/data/fit-offload.mts /path/to/observed.json YYYY-MM-DDTHH:mm:ssZ');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const history = JSON.parse(await readFile(resolve(root, 'data/hospital-history.json'), 'utf8'));
const baselines = Object.fromEntries(Object.entries(history.hospitals).map(([id, value]) => [id, (value as {offloadMinutes:number}).offloadMinutes]));
const result = fitOffloadModels(JSON.parse(await readFile(resolve(input), 'utf8')), baselines, asOf);
// The shipped artifact contains aggregate model summaries only, never encounter IDs/timestamps.
const destination = resolve(root, 'data/offload-model.json');
await writeFile(`${destination}.tmp`, JSON.stringify(result.artifact, null, 2) + '\n');
await rename(`${destination}.tmp`, destination);
console.log(JSON.stringify(result.reports, null, 2));
