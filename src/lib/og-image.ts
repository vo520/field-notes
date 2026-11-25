/**
 * 构建时生成 OG 社交图。
 * 返回 SVG（Sharp 支持作为输入），由 Astro SSG 路由转 PNG 输出到 dist。
 *
 * 设计参数（固定，避免动态依赖）：
 *   尺寸 1200×630（OG 标准），内边距 64，最大标题字重 800 34px 截断 2 行。
 */

export interface OgPayload {
  /** 顶部分类标签（大写，如 "BLOG POST" / "PROJECT"） */
  eyebrow: string;
  /** 主标题，自动截断 2 行 */
  title: string;
  /** 可选副标题 */
  description?: string;
  /** 底部品牌（默认 siteConfig.brand） */
  footer?: string;
  /** 可选封面图 URL（data URL 或远程；远程需在构建时可访问） */
  coverImageUrl?: string;
}

/** 硬编码字体 SVG，Sharp rasterize 时转成 PNG。使用系统 sans-serif stack。 */
export function renderOgSvg(payload: OgPayload): string {
  const { eyebrow, title, description = '', footer = 'NICE / FULL-STACK ENGINEER' } = payload;

  const titleLines = wrapLines(title, 30, 2);
  const descLines = description ? wrapLines(description, 44, 3) : [];

  const titleY = 260;
  const descY = titleY + titleLines.length * 52 + 30;

  const footerSafe = footer.replace(/&/g, '&amp;').replace(/</g, '&lt;');

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
  <text x="88" y="110" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="20" font-weight="600" fill="#9899a1" letter-spacing="0.12em">${escapeSvg(eyebrow.toUpperCase())}</text>
  <text x="64" y="${titleY}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="42" font-weight="800" fill="#ffffff">${titleText}</text>
  ${descText ? `<text x="64" y="${descY}" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="20" fill="#9899a1">${descText}</text>` : ''}
  <line x1="64" y1="540" x2="240" y2="540" stroke="url(#accent)" stroke-width="2" stroke-linecap="round"/>
  <text x="64" y="580" font-family="system-ui, -apple-system, 'Segoe UI', sans-serif" font-size="18" fill="#6b6fff" font-weight="600">${footerSafe}</text>
</svg>`;
}

function escapeSvg(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function wrapLines(text: string, maxCharsPerLine: number, maxLines: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? current + ' ' + word : word;
    if (candidate.length > maxCharsPerLine) {
      if (current) lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
    if (lines.length >= maxLines - 1) break;
  }
  if (current && lines.length < maxLines) lines.push(current);
  if (lines.length >= maxLines) {
    const lastIdx = maxLines - 1;
    const last = lines[lastIdx] ?? '';
    lines[lastIdx] = last.length > maxCharsPerLine - 1 ? last.slice(0, maxCharsPerLine - 1) + '…' : last + '…';
  }
  return lines;
}
