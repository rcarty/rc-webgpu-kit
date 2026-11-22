import { initGPU } from '../src/index.js';
import { scanTests } from './scan.test.js';
import { sortTests } from './sort.test.js';

const log = t => {
  document.getElementById('log').textContent += t + '\n';
};

async function run() {
  const { device } = await initGPU();
  const results = [...(await scanTests(device)), ...(await sortTests(device))];
  for (const r of results) log(`${r.ok ? 'ok  ' : 'FAIL'} ${r.name}`);
  const failed = results.filter(r => !r.ok).length;
  log(failed ? `${failed} of ${results.length} failed` : `all ${results.length} passed`);
  return { failed, total: results.length };
}

window.__result = run().catch(e => {
  log('error: ' + e.message);
  return { failed: 1, total: 0, error: e.message };
});
