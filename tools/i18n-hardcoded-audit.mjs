import fs from 'fs';
import path from 'path';

const root = process.cwd();
const pagesDir = path.join(root, 'client/src/pages');
const exts = new Set(['.tsx', '.ts']);
const findings = [];

function walk(dir) {
  for (const item of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, item.name);
    if (item.isDirectory()) walk(full);
    else if (exts.has(path.extname(item.name))) scan(full);
  }
}

function scan(file) {
  const rel = path.relative(root, file).replace(/\\/g, '/');
  const text = fs.readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  lines.forEach((line, i) => {
    const ln = i + 1;
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('//')) return;
    if (trimmed.includes('t("') || trimmed.includes("t('") || trimmed.includes('useI18n')) return;

    const jsxText = trimmed.match(/>([^<{][^<]{2,})</g);
    const stringLit = trimmed.match(/"([A-Za-z][^"]{2,})"|'([A-Za-z][^']{2,})'/g);
    const candidates = [];
    if (jsxText) candidates.push(...jsxText.map(x => x.slice(1, -1).trim()));
    if (stringLit) candidates.push(...stringLit.map(x => x.slice(1, -1).trim()));

    for (const c of candidates) {
      if (/^[A-Za-z][A-Za-z0-9 _.,:;!?()\/-]{3,}$/.test(c) && !c.startsWith('http') && !c.includes('/')) {
        findings.push({ file: rel, line: ln, text: c.slice(0, 120) });
      }
    }
  });
}

walk(pagesDir);

const grouped = new Map();
for (const f of findings) {
  if (!grouped.has(f.file)) grouped.set(f.file, []);
  grouped.get(f.file).push(f);
}

const out = [];
out.push('# i18n Hardcoded Text Audit (2026-03-02)');
out.push('');
out.push(`- Total potential hardcoded text findings: **${findings.length}**`);
out.push(`- Affected files: **${grouped.size}**`);
out.push('');
out.push('## Top files by findings');
for (const [file, arr] of [...grouped.entries()].sort((a,b)=>b[1].length-a[1].length).slice(0,20)) {
  out.push(`- \`${file}\`: ${arr.length}`);
}
out.push('');
out.push('## Findings');
for (const [file, arr] of [...grouped.entries()].sort((a,b)=>a[0].localeCompare(b[0]))) {
  out.push(`### ${file}`);
  for (const x of arr.slice(0,80)) out.push(`- L${x.line}: \`${x.text}\``);
  if (arr.length>80) out.push(`- ... ${arr.length-80} more`);
  out.push('');
}
out.push('## Method & limits');
out.push('- Heuristic scan for English-like hardcoded literals in client/src/pages/**.');
out.push('- May include false positives; should be triaged before migration.');

fs.writeFileSync(path.join(root, 'docs/I18N_HARDCODED_AUDIT_2026-03-02.md'), out.join('\n'));
console.log('Generated docs/I18N_HARDCODED_AUDIT_2026-03-02.md');
