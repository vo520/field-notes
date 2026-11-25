/**
 * 构建时生成 OG 社交图。
 * 返回 SVG（Sharp 支持作为输入），由 Astro SSG 路由转 PNG 输出到 dist。
 *
 * 设计参数（固定，避免动态依赖）：
 *   尺寸 1200×630（OG 标准），内边距 64，标题 42px 加粗，最多 2 行、超出以省略号截断。
 */

export interface OgPayload {
  /** 顶部分类标签（大写，如 "BLOG POST" / "PROJECT"） */
  eyebrow: string;
  /** 主标题，自动截断 2 行 */
  title: string;
  /** 可选副标题 */
  description?: string;
  /** 底部品牌，由调用方从 site.json 读取后传入，避免这里再写一份站点品牌快照 */
  footer: string;
  /** 可选封面图 URL（data URL 或远程；远程需在构建时可访问） */
  coverImageUrl?: string;
}

/**
 * 页面路径 → OG 图路径。
 * 只有文章/项目详情页有按内容生成的图（generate-og.mjs 按内容 id 输出），
 * 列表、标签、分类等页面统一回退站点默认图，避免 og:image 指向 404。
 */
export function buildOgPath(pathname: string): string {
  const [section, ...rest] = pathname.split('/').filter(Boolean);
  // 按路径段判断，避免 /projects/categories-xxx/ 这类以 categories 开头的项目 id 被误判成分类页。
  const isDetail = rest.length > 0
    && (section === 'articles' || (section === 'projects' && rest[0] !== 'categories'));
  return isDetail ? `/og/${[section, ...rest].join('/')}.png` : '/og/root.png';
}

/** 硬编码字体 SVG，Sharp rasterize 时转成 PNG。使用系统 sans-serif stack。 */
export function renderOgSvg(payload: OgPayload): string {
  const { eyebrow, title, description = '', footer } = payload;

  const titleLines = wrapLines(title, { fontSize: 42, maxWidth: CONTENT_WIDTH, maxLines: 2 });
  const descLines = description
    ? wrapLines(description, { fontSize: 20, maxWidth: CONTENT_WIDTH, maxLines: 3 })
    : [];

  const titleY = 260;
  const descY = titleY + titleLines.length * 52 + 30;

  const footerText = escapeSvg(footer);

  const titleText = titleLines
    .map((line, i) => `<tspan x="64" dy="${i === 0 ? 0 : 52}">${escapeSvg(line)}</tspan>`)
    .join('');

  const descText = descLines
    .map((line, i) => `<tspan x="64" dy="${i === 0 ? 0 : 34}">${escapeSvg(line)}</tspan>`)
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0f1014"/>
      <stop offset="100%" stop-color="#1c1d24"/>
    </linearGradient>
    <linearGradient id="accent" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#6b6fff"/>
      <stop offset="100%" stop-color="#ff6f91"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect x="64" y="80" width="8" height="40" fill="url(#accent)" rx="2"/>
  <text x="88" y="110" font-family="${FONT_STACK}" font-size="20" font-weight="600" fill="#9899a1" letter-spacing="0.12em">${escapeSvg(eyebrow.toUpperCase())}</text>
  <text x="64" y="${titleY}" font-family="${FONT_STACK}" font-size="42" font-weight="800" fill="#ffffff">${titleText}</text>
  ${descText ? `<text x="64" y="${descY}" font-family="${FONT_STACK}" font-size="20" fill="#9899a1">${descText}</text>` : ''}
  <line x1="64" y1="540" x2="240" y2="540" stroke="url(#accent)" stroke-width="2" stroke-linecap="round"/>
  <text x="64" y="580" font-family="${FONT_STACK}" font-size="18" fill="#6b6fff" font-weight="600">${footerText}</text>
</svg>`;
}

function escapeSvg(input: string): string {
  return input
    // XML 1.0 不允许这些控制字符，Sharp 栅格化会直接抛错中断整站构建
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * 字体栈。Sharp/librsvg 按字体族逐个匹配字形，缺少中文字体会把
 * 全角标点（如「｜」U+FF5C）渲染成豆腐块，因此显式带上系统中文字体。
 */
const FONT_STACK = `system-ui, -apple-system, 'PingFang SC', 'Hiragino Sans GB', 'Noto Sans CJK SC', 'Segoe UI', sans-serif`;

const CONTENT_WIDTH = 1200 - 64 * 2;
/** 全角（CJK / emoji / 全角标点）按 1em、其余按 0.55em 估算宽度，避免依赖字体度量。 */
const FULLWIDTH_PATTERN = /[\u2e80-\u9fff\uac00-\ud7af\u3000-\u303f\uff00-\uffef]|[\u2600-\u27bf]|[\u{1f000}-\u{1faff}]|\ufe0f/u;

const graphemeSegmenter = new Intl.Segmenter('zh', { granularity: 'grapheme' });

/** 按字素簇切分：硬切与计宽都不能越过簇边界，否则 emoji ZWJ 组合序列会被拆成破碎字形。 */
function graphemes(text: string): string[] {
  return Array.from(graphemeSegmenter.segment(text), (segment) => segment.segment);
}

function textWidth(text: string, fontSize: number): number {
  let width = 0;
  for (const cluster of graphemes(text)) {
    // 一个字素簇（如 👨‍👩‍👧‍👦）按其首字符判定全角，整体最多计 1em，方向安全（只会高估提前换行）。
    width += FULLWIDTH_PATTERN.test(cluster) ? fontSize : fontSize * 0.55;
  }
  return width;
}

/** 硬切后的片段：同源相邻片段拼回一行时不能插入空格（否则 URL / 中文会被插入空洞）。 */
interface SplitChunk { text: string; sourceId: number }

/** 无空格的超长片段（中文标题、URL）先按宽度硬切，保证后续能换行。 */
function splitToken(token: string, fontSize: number, maxWidth: number, sourceId: number): SplitChunk[] {
  const clusters = graphemes(token);
  const totalWidth = clusters.reduce((sum, cluster) => sum + textWidth(cluster, fontSize), 0);
  // 按预期行数均分宽度，避免末行只剩一两个字（如 26 字标题切成 25 + 1）。
  const targetWidth = totalWidth / Math.ceil(totalWidth / maxWidth);

  const chunks: SplitChunk[] = [];
  let chunk = '';
  let width = 0;

  for (const cluster of clusters) {
    const clusterWidth = textWidth(cluster, fontSize);
    if (chunk && width + clusterWidth > targetWidth) {
      chunks.push({ text: chunk, sourceId });
      chunk = '';
      width = 0;
    }
    chunk += cluster;
    width += clusterWidth;
  }
  if (chunk) chunks.push({ text: chunk, sourceId });

  return chunks;
}

function wrapLines(
  text: string,
  { fontSize, maxWidth, maxLines }: { fontSize: number; maxWidth: number; maxLines: number },
): string[] {
  const tokens: SplitChunk[] = text
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .flatMap((token, index) => (textWidth(token, fontSize) > maxWidth
      ? splitToken(token, fontSize, maxWidth, index)
      : [{ text: token, sourceId: index }]));

  const lines: string[] = [];
  let current = '';
  let currentSourceId = -1;

  for (const { text: token, sourceId } of tokens) {
    // 同源硬切片段直接拼接；不同源的原词之间才需要空格
    const candidate = current
      ? `${current}${sourceId === currentSourceId ? '' : ' '}${token}`
      : token;
    if (current && textWidth(candidate, fontSize) > maxWidth) {
      lines.push(current);
      current = token;
    } else {
      current = candidate;
    }
    currentSourceId = sourceId;
  }
  if (current) lines.push(current);

  if (lines.length <= maxLines) return lines;

  // 超出行数：保留前 maxLines 行，末行逐步回缩到能容纳省略号，避免贴边溢出。
  const kept = lines.slice(0, maxLines);
  const lastChars = Array.from(kept[maxLines - 1]!);
  while (lastChars.length > 0 && textWidth(`${lastChars.join('')}…`, fontSize) > maxWidth) {
    lastChars.pop();
  }
  kept[maxLines - 1] = `${lastChars.join('')}…`;

  return kept;
}
