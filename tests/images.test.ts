import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import { buildOgPath, renderOgSvg } from '../src/lib/og-image';
import { readImageSize } from '../src/lib/image-size';
import { isDraftFlag } from '../src/lib/publishing-rules';
import { readMarkdownFrontmatter, readPublishedProjects } from './_helpers/frontmatter';

const ALLOWED_EXTENSIONS = ['.avif', '.jpeg', '.jpg', '.png', '.svg', '.webp'];
const FILE_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*\.[a-z0-9]+$/;
const MAX_UPLOAD_BYTES = 512 * 1024;
const ARTICLE_DIR = 'src/content/articles';

interface ImageReference {
  entry: string;
  src: string;
  /** 只有会进入构建产物的条目才校验路径有效性；草稿的引用仍计入孤儿判定 */
  published: boolean;
}

function entryFiles(dir: string): string[] {
  return readdirSync(dir)
    .filter((name) => /\.mdx?$/.test(name))
    .sort()
    .map((name) => join(dir, name));
}

function entryLabel(dir: string, file: string): string {
  return `${dir.split('/').pop()}/${file.split('/').pop()!.replace(/\.mdx?$/, '')}`;
}

function collectImageReferences(): ImageReference[] {
  const references: ImageReference[] = [];

  for (const file of entryFiles(ARTICLE_DIR)) {
    const frontmatter = readMarkdownFrontmatter(file);
    const label = entryLabel(ARTICLE_DIR, file);
    // 与 isVisibleEntry(entry, true) 同一口径：草稿不进产物，其路径错误不该让测试变红
    const published = !isDraftFlag(frontmatter.draft);

    if (typeof frontmatter.cover === 'string' && frontmatter.cover !== '') {
      references.push({ entry: label, src: frontmatter.cover, published });
    }

    if (Array.isArray(frontmatter.screenshots)) {
      for (const screenshot of frontmatter.screenshots as Array<{ src?: string }>) {
        if (typeof screenshot.src === 'string' && screenshot.src !== '') {
          references.push({ entry: label, src: screenshot.src, published });
        }
      }
    }
  }

  // 草稿与违反发布红线的项目不进入构建产物，其图片引用也不参与校验
  for (const { slug, data } of readPublishedProjects()) {
    const label = `projects/${slug}`;

    if (data.cover) {
      references.push({ entry: label, src: data.cover, published: true });
    }

    for (const screenshot of data.screenshots ?? []) {
      references.push({ entry: label, src: screenshot.src, published: true });
    }
  }

  // 后台可上传的站点图片（如微信二维码）同样算作被引用，避免误判为孤儿图片
  const siteSocial = (JSON.parse(readFileSync('src/data/site.json', 'utf8')) as {
    social?: { wechatQr?: string };
  }).social;
  if (typeof siteSocial?.wechatQr === 'string' && siteSocial.wechatQr !== '') {
    references.push({ entry: 'site/social.wechatQr', src: siteSocial.wechatQr, published: true });
  }

  return references;
}

function listImageFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];

  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    // 跳过 .DS_Store 等系统隐藏文件，它们不是站点资源，也不该让本地测试变红
    if (entry.name.startsWith('.')) return [];
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) return listImageFiles(fullPath);
    return [fullPath];
  });
}

function tspanCount(svg: string): number {
  return svg.match(/<tspan/g)?.length ?? 0;
}

// 五段式测试框架：
// 1. 用户要完成什么：站内引用图片真实存在、WebP 可解析、OG 图按页面规则落位。
// 2. 页面要怎么走：文章/项目引用 → /images 站内路径 → public 下真实文件。
// 3. 空和失败怎么处理：非法文件名/路径拒绝、孤儿图只提示不阻断、XML 非法字符清理、后台上传体积兜底。
// 4. 界面为什么这样排版：截图宽高按真实像素校正、OG 标题换行/全角计宽/ZWJ 不切断。
// 5. 最后代码怎么落地：Sveltia 后台约束与仓库图片规则一致，buildOgPath 覆盖所有路由形态。

describe('图片资源', () => {
  describe('1. 用户要完成什么：图片可用且可解析', () => {
    it('readImageSize 能解析 WebP（RIFF 魔数在字节 8-11）', () => {
      const references = collectImageReferences();
      const webp = references.find(({ src, published }) => published && src.endsWith('.webp'));
      expect(webp, '至少引用一张 WebP 截图').toBeDefined();

      const size = readImageSize(`public${webp!.src}`);
      expect(size, `${webp!.src} 的尺寸必须能被解析，否则尺寸断言会被静默跳过`).not.toBeNull();
      expect(size!.width).toBeGreaterThan(0);
      expect(size!.height).toBeGreaterThan(0);
    });

    it('readImageSize 能解析 AVIF（取 ispe box 里面积最大的尺寸）', () => {
      const dir = mkdtempSync(join(tmpdir(), 'image-size-'));
      const filePath = join(dir, 'sample.avif');
      // 伪造 ISO BMFF 结构：ftyp + 缩略图 ispe + 主图 ispe
      const buffer = Buffer.alloc(64);
      buffer.write('ftyp', 4, 'ascii');
      buffer.write('ispe', 16, 'ascii');
      buffer.writeUInt32BE(320, 24);
      buffer.writeUInt32BE(180, 28);
      buffer.write('ispe', 40, 'ascii');
      buffer.writeUInt32BE(1280, 48);
      buffer.writeUInt32BE(720, 52);
      writeFileSync(filePath, buffer);

      try {
        expect(readImageSize(filePath)).toEqual({ width: 1280, height: 720 });
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it('每个引用的图片都存在于 public 下且来自站内 /images 目录', () => {
      const references = collectImageReferences();
      const publishedReferences = references.filter(({ published }) => published);
      expect(publishedReferences.length).toBeGreaterThan(0);

      for (const { entry, src } of publishedReferences) {
        expect(src.startsWith('/images/'), `${entry} 的图片应位于 /images 下：${src}`).toBe(true);
        expect(existsSync(`public${src}`), `${entry} 引用了不存在的图片：${src}`).toBe(true);
      }
    });
  });

  describe('2. 页面要怎么走：引用落到站内真实文件', () => {
    it('截图宽高由构建按图片实际像素自动校正', () => {
      for (const { slug, data } of readPublishedProjects()) {
        for (const screenshot of data.screenshots ?? []) {
          const size = readImageSize(`public${screenshot.src}`);
          const label = `${slug} ${screenshot.src}`;

          expect(size, `${label} 的图片尺寸无法解析，构建无法自动校正宽高`).not.toBeNull();
          expect(screenshot.width, `${label} 的宽度未被自动校正`).toBe(size!.width);
          expect(screenshot.height, `${label} 的高度未被自动校正`).toBe(size!.height);
        }
      }
    });
  });

  describe('3. 空和失败怎么处理：非法输入与孤儿图兜底', () => {
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

    it('后台上传目录中的孤儿图片只提示、不阻断构建', () => {
      const references = collectImageReferences();
      const referenced = new Set(references.map(({ src }) => `public${src}`));
      const orphans = listImageFiles('public/images/uploads').filter((filePath) => !referenced.has(filePath));

      // 在 CMS 里换图或移除截图不会删掉旧文件，这是后台上传的固有行为，
      // 若作为硬闸门会让任何一次正常换图都阻断部署，因此只提示清理。
      if (orphans.length > 0) {
        console.warn(`以下上传图片已没有内容引用，可在 Sveltia 资源库中删除：\n${orphans.join('\n')}`);
      }
    });

    it('后台上传的图片不超过 512 KB', () => {
      for (const filePath of listImageFiles('public/images/uploads')) {
        const { size } = statSync(filePath);
        expect(size, `${filePath} 超过 512 KB，请压缩后再上传`).toBeLessThanOrEqual(MAX_UPLOAD_BYTES);
      }
    });
  });

  describe('5. 最后代码怎么落地：后台约束与仓库一致', () => {
    it('Sveltia 后台上传配置与仓库的图片约束一致', () => {
      const config = parseYaml(readFileSync('public/admin/config.yml', 'utf8')) as {
        media_libraries?: {
          all?: {
            max_file_size?: number;
            transformations?: { raster_image?: { format?: string } };
          };
          default?: { config?: { slugify_filename?: boolean } };
        };
      };

      // 后台不限制文件名与体积时，任何一次正常上传都会让上面的断言失败、阻断部署
      expect(config.media_libraries?.default?.config?.slugify_filename).toBe(true);
      expect(config.media_libraries?.all?.max_file_size).toBeLessThanOrEqual(MAX_UPLOAD_BYTES);
      expect(config.media_libraries?.all?.transformations?.raster_image?.format).toBe('webp');
    });
  });
});

describe('OG 社交图路径', () => {
  describe('5. 最后代码怎么落地：路径规则覆盖所有路由', () => {
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
      expect(buildOgPath('/articles/example-post/')).toBe('/og/articles/example-post.png');
      expect(buildOgPath('/projects/example-project/')).toBe('/og/projects/example-project.png');
      expect(buildOgPath('/articles/series/part-one/')).toBe('/og/articles/series/part-one.png');
    });
  });
});

describe('OG 社交图渲染', () => {
  describe('1. 用户要完成什么：标题可读地渲染进画布', () => {
    it('短标题单行渲染且不出现省略号', () => {
      const svg = renderOgSvg({ eyebrow: 'BLOG POST', title: 'Redis 搜索结果集', footer: 'TEST BRAND' });

      expect(tspanCount(svg)).toBe(1);
      expect(svg).not.toContain('…');
    });
  });

  describe('4. 界面为什么这样排版：换行、全角与字素簇', () => {
    it('无空格长中文标题自动换行，最多两行并以省略号截断', () => {
      const title = '一个每日自动签到系统的工程笔记：从登录态维持、设备锁识别到任务幂等重试的完整实践复盘，包含调度编排、失败补偿与告警观测的全部设计细节与线上演练';
      const svg = renderOgSvg({ eyebrow: 'BLOG POST', title, footer: 'TEST BRAND' });

      expect(title.length).toBeGreaterThan(70);
      expect(tspanCount(svg)).toBe(2);
      expect(svg).toContain('…');
    });

    it('硬切后的同源片段拼回时不插入空格，URL 不会被破坏', () => {
      const title = 'https://example.com/a/b/c/d/e/f/g/h/i/j/k/l/m/n/o/p/q/r/s/t/u/v/w/x/y/z';
      const svg = renderOgSvg({ eyebrow: 'BLOG POST', title, footer: 'TEST BRAND' });
      const lines = [...svg.matchAll(/<tspan[^>]*>([\s\S]*?)<\/tspan>/g)].map((match) => match[1]);
      const joined = lines.join('');

      expect(joined).toContain('https://example.com/');
      expect(joined).not.toMatch(/[a-z]\s+[a-z/]/);
    });

    it('emoji 按全角计宽，纯 emoji 标题会换行而不是溢出画布', () => {
      const svg = renderOgSvg({ eyebrow: 'BLOG POST', title: '🚀'.repeat(30), footer: 'TEST BRAND' });

      expect(tspanCount(svg)).toBeGreaterThan(1);
    });

    it('截断回缩按字素簇进行，不会切断 emoji ZWJ 序列', () => {
      // 75 个家庭 emoji：硬切后每行 25 个，第三行被省略号截断且必须回缩一个完整簇
      const family = '👨‍👩‍👧‍👦';
      const svg = renderOgSvg({ eyebrow: 'BLOG POST', title: family.repeat(75), footer: 'TEST BRAND' });
      const lastLine = [...svg.matchAll(/<tspan[^>]*>([\s\S]*?)<\/tspan>/g)].at(-1)![1]!;

      expect(lastLine.endsWith('…')).toBe(true);
      // 去掉省略号后，剩余码点数必须是整簇的整数倍；按码点回缩会留下半个 ZWJ 序列
      expect([...(lastLine.slice(0, -1))].length % [...family].length).toBe(0);
    });
  });

  describe('3. 空和失败怎么处理：非法字符被清理', () => {
    it('标题中的 HTML 被转义，不会破坏 SVG 结构', () => {
      const svg = renderOgSvg({ eyebrow: 'BLOG POST', title: '<script>alert(1)</script>', footer: 'TEST BRAND' });

      expect(svg).toContain('&lt;script&gt;');
      expect(svg).not.toContain('<script');
    });

    it('XML 非法控制字符被清理，不会中断 OG 栅格化', () => {
      const svg = renderOgSvg({ eyebrow: 'BLOG POST', title: 'A\u0001B', footer: 'TEST BRAND' });

      expect(svg).not.toContain('\u0001');
      expect(svg).toContain('AB');
    });
  });
});
