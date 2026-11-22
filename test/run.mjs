// runs test/index.html in headless Chrome on the software Vulkan driver, so no GPU needed
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const types = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.wgsl': 'text/plain',
};

const server = createServer(async (req, res) => {
  try {
    const path = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname));
    const body = await readFile(join(root, path));
    res.writeHead(200, { 'content-type': types[extname(path)] || 'application/octet-stream' });
    res.end(body);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const { port } = server.address();

const browser = await chromium.launch({
  channel: process.env.CHROME_CHANNEL || 'chrome',
  args: [
    '--enable-unsafe-webgpu',
    '--enable-features=Vulkan',
    '--use-angle=swiftshader',
    '--use-vulkan=swiftshader',
    '--ignore-gpu-blocklist',
  ],
});
process.exitCode = 1;
try {
  const page = await browser.newPage();
  page.on('console', m => {
    if (m.type() === 'error' || m.type() === 'warning')
      console.log(`[browser ${m.type()}]`, m.text());
  });
  await page.goto(`http://127.0.0.1:${port}/test/index.html`);
  const result = await page.evaluate(() => window.__result);
  console.log(await page.textContent('#log'));
  process.exitCode = result.failed ? 1 : 0;
} finally {
  await browser.close();
  server.close();
}
