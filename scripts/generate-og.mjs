/**
 * 构建前生成 OG 社交图 → public/og/（Astro 会把 public/ 原样拷贝到 dist/）。
 * 1200×630 PNG，Sharp rasterize SVG 模板。
 *
 * 用法：`npx tsx scripts/generate-og.mjs` 或加到 package.json "build" 前置。
 * 不依赖 Astro content runtime——直接从 src/content 读 markdown。
 */
import sharp from 'sharp';
import YAML from 'yaml';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { renderOgSvg } from '../src/lib/og-image.ts';
import { getProjectPublishingIssues, isDraftFlag } from '../src/lib/publishing-rules.ts';
import { normalizeCategories } from '../src/lib/project-category-guard.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const OUT_DIR = path.resolve(ROOT, 'public/og');
const SRC = path.resolve(ROOT, 'src/content');

// 站点信息与后台同源：直接读 src/data/site.json，避免脚本 import Astro runtime。
// 本脚本先于 astro build 执行，这里先做字段校验，避免配置缺失时报 TypeError 而非明确的配置错误。
const siteData = JSON.parse(fs.readFileSync(path.resolve(ROOT, 'src/data/site.json'), 'utf8'));
const SITE_TITLE = siteData.title;
const SITE_DESC = siteData.description;
const SITE_BRAND = siteData.brand;
const OG_LABELS = siteData.og;
// 与发布闸门同口径：分类清单同样由后台维护，OG 图也必须遵守这条红线，
// 否则分类改名后项目页已下线，公开目录里却还留着标题/摘要的 OG 图。
const PROJECT_CATEGORIES = normalizeCategories(siteData.projectsPage?.categories);

if (!SITE_TITLE || !SITE_DESC || !SITE_BRAND || !OG_LABELS?.rootLabel || !OG_LABELS?.articleLabel || !OG_LABELS?.projectLabel) {
  throw new Error('site.json 缺少必需字段（title / description / brand / og.rootLabel / og.articleLabel / og.projectLabel），请检查后台「站点信息」配置');
}

if (fs.existsSync(OUT_DIR)) fs.rmSync(OUT_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });
fs.mkdirSync(path.join(OUT_DIR, 'articles'), { recursive: true });
fs.mkdirSync(path.join(OUT_DIR, 'projects'), { recursive: true });

const results = [];

// Root
await writeOg('root.png', { eyebrow: OG_LABELS.rootLabel, title: SITE_TITLE, description: SITE_DESC, footer: SITE_BRAND });

// Articles
const articleFiles = walkMarkdown(path.join(SRC, 'articles'));
for (const rel of articleFiles) {
  const frontmatter = readFrontmatter(path.join(SRC, 'articles', rel));
  // 草稿在生产构建里不生成页面，OG 图也不该把标题/摘要泄漏到公开目录
  // 草稿判断复用 publishing-rules 的归一口径（与 schema 的 looseBoolean 一致）
  if (isDraftFlag(frontmatter.draft)) continue;
  const id = rel.replace(/\.mdx?$/, '');
  await writeOg(`articles/${id}.png`, {
    eyebrow: OG_LABELS.articleLabel,
    title: frontmatter.title ?? id,
    description: frontmatter.description ?? '',
    footer: SITE_BRAND,
  });
}

// Projects
const projectFiles = walkMarkdown(path.join(SRC, 'projects'));
const warnedOgProjects = new Set();
for (const rel of projectFiles) {
  const frontmatter = readFrontmatter(path.join(SRC, 'projects', rel));
  // 草稿在生产构建里不生成页面，OG 图也不该把标题/摘要泄漏到公开目录
  // 草稿判断复用 publishing-rules 的归一口径（与 schema 的 looseBoolean 一致）
  if (isDraftFlag(frontmatter.draft)) continue;
  // 与发布闸门同一事实源：违反发布红线的项目不会出现在站点上，OG 图同样不生成
  const issues = getProjectPublishingIssues(frontmatter, { categories: PROJECT_CATEGORIES });
  if (issues.length > 0) {
    const id = rel.replace(/\.mdx?$/, '');
    if (!warnedOgProjects.has(id)) {
      warnedOgProjects.add(id);
      console.warn(`[og] 已跳过未发布项目 "${id}"：${issues.map((issue) => issue.message).join('；')}`);
    }
    continue;
  }
  const id = rel.replace(/\.mdx?$/, '');
  await writeOg(`projects/${id}.png`, {
    eyebrow: OG_LABELS.projectLabel,
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
  // 用项目已有的 yaml 依赖解析：逐行 indexOf(':') 会把 screenshots[].title 等缩进子键
  // 覆盖顶层 title，且无法正确处理 draft: True / draft: true # 注释 等合法 YAML 写法。
  const parsed = YAML.parse(m[1]);
  return parsed && typeof parsed === 'object' ? parsed : {};
}
