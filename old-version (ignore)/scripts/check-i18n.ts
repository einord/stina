import { readFile } from 'node:fs/promises';
import path from 'node:path';

type Dict = Record<string, unknown>;

function flatten(obj: Dict, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') {
      Object.assign(out, flatten(v as Dict, key));
    } else {
      out[key] = String(v ?? '');
    }
  }
  return out;
}

function extractPlaceholders(s: string): Set<string> {
  const re = /\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g;
  const set = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) set.add(m[1]);
  return set;
}

async function main() {
  const enPath = path.resolve(__dirname, '../packages/i18n/src/locales/en.json');
  const svPath = path.resolve(__dirname, '../packages/i18n/src/locales/sv.json');

  const [enRaw, svRaw] = await Promise.all([readFile(enPath, 'utf8'), readFile(svPath, 'utf8')]);
  const en = JSON.parse(enRaw) as Dict;
  const sv = JSON.parse(svRaw) as Dict;

  const flatEn = flatten(en);
  const flatSv = flatten(sv);

  const enKeys = new Set(Object.keys(flatEn));
  const svKeys = new Set(Object.keys(flatSv));

  const missingInEn: string[] = [];
  const missingInSv: string[] = [];

  for (const k of svKeys) if (!enKeys.has(k)) missingInEn.push(k);
  for (const k of enKeys) if (!svKeys.has(k)) missingInSv.push(k);

  const placeholderMismatches: Array<{ key: string; en: string[]; sv: string[] }> = [];
  for (const k of enKeys) {
    if (!svKeys.has(k)) continue;
    const enPh = Array.from(extractPlaceholders(flatEn[k]));
    const svPh = Array.from(extractPlaceholders(flatSv[k]));
    const same = enPh.length === svPh.length && enPh.every((x) => svPh.includes(x));
    if (!same) {
      placeholderMismatches.push({ key: k, en: enPh.sort(), sv: svPh.sort() });
    }
  }

  let hasError = false;
  const lines: string[] = [];
  if (missingInEn.length) {
    hasError = true;
    lines.push(`Missing in en.json (${missingInEn.length}):`);
    lines.push(...missingInEn.sort().map((k) => `  - ${k}`));
  }
  if (missingInSv.length) {
    hasError = true;
    lines.push(`Missing in sv.json (${missingInSv.length}):`);
    lines.push(...missingInSv.sort().map((k) => `  - ${k}`));
  }
  if (placeholderMismatches.length) {
    hasError = true;
    lines.push(`Placeholder mismatches (${placeholderMismatches.length}):`);
    for (const m of placeholderMismatches.sort((a, b) => a.key.localeCompare(b.key))) {
      lines.push(`  - ${m.key}`);
      lines.push(`      en: ${m.en.join(', ') || '—'}`);
      lines.push(`      sv: ${m.sv.join(', ') || '—'}`);
    }
  }

  if (hasError) {
    console.error('[i18n] Validation failed:\n' + lines.join('\n'));
    process.exit(1);
  } else {
    console.log('[i18n] OK: en.json and sv.json are in parity and placeholders match.');
  }
}

// run
main().catch((err) => {
  console.error('[i18n] Unexpected error:', err);
  process.exit(1);
});
