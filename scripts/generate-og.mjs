/**
 * 构建前生成 OG 社交图 → public/og/（Astro 会把 public/ 原样拷贝到 dist/）。
 * 1200×630 PNG，Sharp rasterize SVG 模板。
 *
 * 用法：`npx tsx scripts/generate-og.mjs` 或加到 package.json "build" 前置。
 * 不依赖 Astro content runtime——直接从 src/content 读 markdown。
 */
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderOgSvg } from '../src/lib/og-image.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(ROOT, 'public/og');
const SRC = path.resolve(ROOT, 'src/content');

// 站点信息与后台同源：直接读 src/data/site.json，避免脚本 import Astro runtime
const siteData = JSON.parse(fs.readFileSync(path.resolve(ROOT, 'src/data/site.json'), 'utf8'));
const SITE_TITLE = siteData.title;
const SITE_DESC = siteData.description;
const SITE_BRAND = siteData.brand;

if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(path.join(OUT_DIR, 'articles'), { recursive: true });
fs.mkdirSync(path.join(OUT_DIR, 'projects'), { recursive: true });

const results = [];

// Root
await writeOg('root.png', { eyebrow: 'BLOG', title: SITE_TITLE, description: SITE_DESC, footer: SITE_BRAND });

// Articles
const articleFiles = walkMarkdown(path.join(SRC, 'articles'));
for (const rel of articleFiles) {
  const frontmatter = readFrontmatter(path.join(SRC, 'articles', rel));
  const id = rel.replace(/\.mdx?$/, '');
  await writeOg(`articles/${id}.png`, {
    eyebrow: 'BLOG POST',
    title: frontmatter.title ?? id,
    description: frontmatter.description ?? '',
    footer: SITE_BRAND,
  });
}

// Projects
const projectFiles = walkMarkdown(path.join(SRC, 'projects'));
for (const rel of projectFiles) {
  const frontmatter = readFrontmatter(path.join(SRC, 'projects', rel));
  const id = rel.replace(/\.mdx?$/, '');
  await writeOg(`projects/${id}.png`, {
    eyebrow: 'PROJECT',
    title: frontmatter.title ?? id,
    description: frontmatter.description ?? '',
    footer: SITE_BRAND,
  });
}

console.log(`[og] generated ${results.length} PNGs → public/og/`);
for (const r of results) console.log(`  og/${r}`);

async function writeOg(file, payload) {
  const svg = renderOgSvg(payload);
  const png = await sharp(Buffer.from(svg)).resize(1200, 630).png({ compressionLevel: 9 }).toBuffer();
  const out = path.join(OUT_DIR, file);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, png);
  results.push(file);
}

function walkMarkdown(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) out.push(...walkMarkdown(path.join(dir, entry.name)).map((rel) => path.join(entry.name, rel)));
    else if (/\.(md|mdx)$/.test(entry.name)) out.push(entry.name);
  }
  return out;
}

function readFrontmatter(filePath) {
  const md = fs.readFileSync(filePath, 'utf8');
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m?.[1]) return {};
  const lines = m[1].split(/\r?\n/);
  const out = {};
  for (const line of lines) {
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim();
    let val = line.slice(idx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    out[key] = val;
  }
  return out;
}
