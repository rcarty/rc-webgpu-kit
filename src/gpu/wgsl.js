// fetches .wgsl and handles a few directives so shaders can share code without a build
// they're written as comments so the files stay valid WGSL for the formatter
//   //#include "file.wgsl"   relative to the including file, included once
//   //#include <name>        source passed in via includes
//   //#if NAME, //#else, //#endif

import { cached } from './resources.js';

const texts = new Map();

const fetchText = href =>
  cached(texts, href, async () => {
    const r = await fetch(href);
    if (!r.ok) throw new Error(`Could not load ${href} (${r.status})`);
    return r.text();
  });

export async function loadWGSL(url, { includes = {}, defines = {} } = {}) {
  const seen = new Set();

  const expand = async href => {
    if (seen.has(href)) return '';
    seen.add(href);
    const out = [];
    const keep = []; // one entry per open #if
    const live = () => keep.every(Boolean);

    for (const line of (await fetchText(href)).split(/\r?\n/)) {
      const m = line.match(/^\s*\/\/\s*#(include|if|else|endif)\b\s*(.*)$/);
      if (!m) {
        if (live()) out.push(line);
        continue;
      }
      const arg = m[2].trim();
      if ((m[1] === 'else' || m[1] === 'endif') && !keep.length)
        throw new Error(`${href}: #${m[1]} without #if`);
      if (m[1] === 'if') keep.push(Boolean(defines[arg]));
      else if (m[1] === 'else') keep[keep.length - 1] = !keep[keep.length - 1];
      else if (m[1] === 'endif') keep.pop();
      else if (live()) {
        const named = arg.match(/^<(.+)>$/);
        const file = arg.match(/^"(.+)"$/);
        if (named) {
          if (!(named[1] in includes))
            throw new Error(`${href}: no source given for #include <${named[1]}>`);
          if (!seen.has(arg)) {
            seen.add(arg);
            out.push(includes[named[1]]);
          }
        } else if (file) {
          out.push(await expand(new URL(file[1], href).href));
        } else {
          throw new Error(`${href}: bad #include ${arg}`);
        }
      }
    }
    if (keep.length) throw new Error(`${href}: #if without #endif`);
    return out.join('\n');
  };

  return expand(new URL(url, document.baseURI).href);
}
