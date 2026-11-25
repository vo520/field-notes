import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { buildOgPath, renderOgSvg } from '../src/lib/og-image';
import { readMarkdownFrontmatter } from './_helpers/frontmatter';

const ALLOWED_EXTENSIONS = ['.avif', '.jpeg', '.jpg', '.png', '.svg', '.webp'];
const FILE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+$/;
const MAX_UPLOAD_BYTES = 512 * 1024;
const CONTENT_DIRS = ['src/content/articles', 'src/content/projects'];

interface ImageReference {
  entry: string;
  src: string;
}

function entryNames(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => name.replace(/\.md$/, ''))
    .sort();
}

function collectImageReferences(): ImageReference[] {
  const references: ImageReference[] = [];

  for (const dir of CONTENT_DIRS) {
    for (const name of entryNames(dir)) {
      const frontmatter = readMarkdownFrontmatter(`${dir}/${name}.md`);
      const label = `${dir.split('/').pop()}/${name}`;

      if (typeof frontmatter.cover === 'string' && frontmatter.cover !== '') {
        references.push({ entry: label, src: frontmatter.cover });
      }

      if (Array.isArray(frontmatter.screenshots)) {
        for (const screenshot of frontmatter.screenshots as Array<{ src?: string }>) {
          if (typeof screenshot.src === 'string' && screenshot.src !== '') {
            references.push({ entry: label, src: screenshot.src });
          }
        }
      }
    }
  }

  return references;
}

function listImageFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return listImageFiles(fullPath);
    return [fullPath];
  });
}

/** 读图片真实像素尺寸；无法识别的格式返回 null，由调用方跳过尺寸断言 */
function readImageSize(filePath: string): { width: number; height: number } | null {
  const buffer = readFileSync(filePath);
  const extension = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();

  if (extension === '.png' && buffer.length > 24 && buffer.toString('ascii', 12, 16) === 'IHDR') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (extension === '.svg') {
    const source = buffer.toString('utf8');
    const width = source.match(/\bwidth="(\d+)"/)?.[1];
    const height = source.match(/\bheight="(\d+)"/)?.[1];
    if (width && height) return { width: Number(width), height: Number(height) };

    const viewBox = source.match(/\bviewBox="[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)"/);
    if (viewBox) return { width: Math.round(Number(viewBox[1])), height: Math.round(Number(viewBox[2])) };
  }

  if (extension === '.jpg' || extension === '.jpeg') {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }

      const marker = buffer[offset + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }

      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
  }

  if (extension === '.webp' && buffer.toString('ascii', 12, 16) === 'WEBP') {
    const chunk = buffer.toString('ascii', 20, 24);

    if (chunk === 'VP8X') {
      const width = buffer.readUIntLE(24, 3) + 1;
      const height = buffer.readUIntLE(27, 3) + 1;
      return { width, height };
    }

    if (chunk === 'VP8 ') {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }

    if (chunk === 'VP8L') {
      const bits = buffer.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }

  return null;
}

describe('图片资源', () => {
  const references = collectImageReferences();

  it('每个引用的图片都存在于 public 下且来自站内 /images 目录', () => {
    expect(references.length).toBeGreaterThan(0);

    for (const { entry, src } of references) {
      expect(src.startsWith('/images/'), `${entry} 的图片应位于 /images 下：${src}`).toBe(true);
      expect(existsSync(`public${src}`), `${entry} 引用了不存在的图片：${src}`).toBe(true);
    }
  });

  it('图片文件名使用小写英文、数字与连字符，格式在允许列表内', () => {
    const files = listImageFiles('public/images');

    for (const filePath of files) {
      const relative = filePath.replace(/^public/, '');
      const name = relative.slice(relative.lastIndexOf('/') + 1);
      const extension = name.slice(name.lastIndexOf('.')).toLowerCase();

      expect(ALLOWED_EXTENSIONS, `${relative} 的格式不被允许`).toContain(extension);
      expect(name, `${relative} 需改成小写英文/数字/连字符命名`).toMatch(FILE_NAME_PATTERN);
    }
  });

  it('截图声明的宽高与图片实际像素一致', () => {
    for (const dir of CONTENT_DIRS) {
      for (const name of entryNames(dir)) {
        const frontmatter = readMarkdownFrontmatter(`${dir}/${name}.md`);
        if (!Array.isArray(frontmatter.screenshots)) continue;

        for (const screenshot of frontmatter.screenshots as Array<{ src?: string; width?: number; height?: number }>) {
          if (!screenshot.src) continue;

          const size = readImageSize(`public${screenshot.src}`);
          if (!size) continue;

          const label = `${dir.split('/').pop()}/${name} ${screenshot.src}`;
          expect(screenshot.width, `${label} 声明的宽度与图片不一致`).toBe(size.width);
          expect(screenshot.height, `${label} 声明的高度与图片不一致`).toBe(size.height);
        }
      }
    }
  });

  it('后台上传目录中没有未被内容引用的孤儿图片', () => {
    const referenced = new Set(references.map(({ src }) => `public${src}`));
    const orphans = listImageFiles('public/images/uploads').filter((filePath) => !referenced.has(filePath));

    expect(orphans, `以下上传图片已没有内容引用，请从仓库删除：\n${orphans.join('\n')}`).toEqual([]);
  });

  it('后台上传的图片不超过 512 KB', () => {
    for (const filePath of listImageFiles('public/images/uploads')) {
      const { size } = statSync(filePath);
      expect(size, `${filePath} 超过 512 KB，请压缩后再上传`).toBeLessThanOrEqual(MAX_UPLOAD_BYTES);
    }
  });
});

describe('OG 社交图路径', () => {
  it('列表、标签、分类与管理页回退站点默认图', () => {
    expect(buildOgPath('/')).toBe('/og/root.png');
    expect(buildOgPath('/articles/')).toBe('/og/root.png');
    expect(buildOgPath('/tags/astro/')).toBe('/og/root.png');
    expect(buildOgPath('/projects/')).toBe('/og/root.png');
    expect(buildOgPath('/projects/categories/')).toBe('/og/root.png');
    expect(buildOgPath('/projects/categories/design/')).toBe('/og/root.png');
    expect(buildOgPath('/projects/categories-archive/')).toBe('/og/projects/categories-archive.png');
    expect(buildOgPath('/admin/review/')).toBe('/og/root.png');
  });

  it('文章与项目详情页跟随内容生成图，嵌套 id 也不会误回落', () => {
    expect(buildOgPath('/articles/redisearch-result-set/')).toBe('/og/articles/redisearch-result-set.png');
    expect(buildOgPath('/projects/dobotcn/')).toBe('/og/projects/dobotcn.png');
    expect(buildOgPath('/articles/series/part-one/')).toBe('/og/articles/series/part-one.png');
  });
});

describe('OG 社交图渲染', () => {
  function tspanCount(svg: string): number {
    return svg.match(/<tspan/g)?.length ?? 0;
  }

  it('短标题单行渲染且不出现省略号', () => {
    const svg = renderOgSvg({ eyebrow: 'BLOG POST', title: 'Redis 搜索结果集' });

    expect(tspanCount(svg)).toBe(1);
    expect(svg).not.toContain('…');
  });

  it('无空格长中文标题自动换行，最多两行并以省略号截断', () => {
    const title = '一个每日自动签到系统的工程笔记：从登录态维持、设备锁识别到任务幂等重试的完整实践复盘，包含调度编排、失败补偿与告警观测的全部设计细节与线上演练';
    const svg = renderOgSvg({ eyebrow: 'BLOG POST', title });

    expect(title.length).toBeGreaterThan(70);
    expect(tspanCount(svg)).toBe(2);
    expect(svg).toContain('…');
  });

  it('标题中的 HTML 被转义，不会破坏 SVG 结构', () => {
    const svg = renderOgSvg({ eyebrow: 'BLOG POST', title: '<script>alert(1)</script>' });

    expect(svg).toContain('&lt;script&gt;');
    expect(svg).not.toContain('<script');
  });
});
