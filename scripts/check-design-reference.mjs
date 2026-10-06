// Fails if the palette in 02-DESIGN-REFERENCE.html drifts from mobile/src/theme/tokens.ts.
// Usage: node scripts/check-design-reference.mjs
//
// Checks:
//  1. Every token in lightPalette / darkPalette has the same hex in the
//     .cartel-light / .cartel-dark CSS blocks of the HTML.
//  2. Every palette hex (both themes) appears at least once as text in the
//     HTML body, outside the <style> block (the palette table and swatch labels).
// Does NOT check: the page-chrome --p-* values, the shadow values, or whether
// the quoted hex labels sit next to the right token name.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tokens = readFileSync(join(root, 'mobile/src/theme/tokens.ts'), 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\/\/.*$/gm, '');
const html = readFileSync(join(root, '02-DESIGN-REFERENCE.html'), 'utf8');

function tokenPalette(name) {
  const m = tokens.match(new RegExp('const ' + name + ': Palette = \\{([\\s\\S]*?)\\r?\\n\\};'));
  if (!m) throw new Error(`Could not find ${name} in tokens.ts`);
  const out = {};
  for (const [, key, hex] of m[1].matchAll(/(\w+):\s*'(#[0-9A-Fa-f]{6})'/g)) out[key] = hex.toUpperCase();
  return out;
}

function htmlPalette(selector) {
  const m = html.match(new RegExp('\\.' + selector + '\\s*\\{([^}]*)\\}'));
  if (!m) throw new Error(`Could not find a .${selector}{...} block in 02-DESIGN-REFERENCE.html`);
  const out = {};
  for (const [, key, hex] of m[1].matchAll(/--(\w+)\s*:\s*(#[0-9A-Fa-f]{6})/g)) out[key] = hex.toUpperCase();
  return out;
}

const problems = [];
for (const [theme, name] of [['cartel-light', 'lightPalette'], ['cartel-dark', 'darkPalette']]) {
  const want = tokenPalette(name);
  const have = htmlPalette(theme);
  if (Object.keys(want).length === 0) problems.push(`${name} parsed empty from tokens.ts`);
  for (const [key, hex] of Object.entries(want)) {
    if (!have[key]) problems.push(`.${theme}: token "${key}" is missing (tokens.ts has ${hex})`);
    else if (have[key] !== hex) problems.push(`.${theme}: token "${key}" is ${have[key]} but tokens.ts ${name} has ${hex}`);
  }
}
const bodyText = html.replace(/<style[\s\S]*?<\/style>/g, '').toUpperCase();
for (const [theme, name] of [['light', 'lightPalette'], ['dark', 'darkPalette']]) {
  for (const [key, hex] of Object.entries(tokenPalette(name))) {
    if (!bodyText.includes(hex)) problems.push(`${theme} "${key}" ${hex} does not appear as text in the HTML body`);
  }
}
if (problems.length) {
  console.error('design reference palette does NOT match tokens.ts:\n- ' + problems.join('\n- '));
  process.exit(1);
}
console.log('design reference palette matches tokens.ts');
