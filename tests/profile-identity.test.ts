import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(import.meta.dirname, '..');
const read = (relative: string) => readFileSync(resolve(root, relative), 'utf8');

// 1. 用户要完成什么：博客只承载站点身份与内容，个人档案（头像、可约状态、技能）
//    属于另一类页面；一旦回流到站点配置，两类页面的边界就模糊了。
// 2. 页面要怎么走：断言覆盖配置层（site.ts / site.json / site-schema.ts）与页面层
//    （首页 / 关于页），两侧都不得出现 ProfileIdentity 的引用。
// 3. 空和失败怎么处理：静态契约在构建期就失败，而不是等运行时才发现；
//    残留组件文件与无引用截图也要清零，避免死资源。
// 4. 界面为什么要这样排版：首页保留自己的三组 studio 数据，由站点配置驱动，
//    不依赖共享 profile 组件——布局归属清晰，才不会两处改同一块内容。
// 5. 最后代码怎么落地：全部断言都是文件级静态检查，不启动浏览器、不发请求，
//    改完 npm test 立即给反馈。

// 站点身份的真实数据在身份模块 site.json、字段定义在 site-schema.ts；只查 site.ts 加载器
// 的话断言永远成立，profile 专用字段回流到配置里也测不出来。
const siteSources = ['src/config/site.ts', 'src/data/site.json', 'src/lib/site-schema.ts'].map(read);
const homeSource = read('src/pages/index.astro');
const aboutSource = read('src/pages/about.astro');
const resumeSource = read('src/pages/resume.astro');
const profileComponentPath = resolve(root, 'src/components/ProfileIdentity.astro');
const obsoleteImages = [
  'api-bench.png', 'bi-report.png', 'db-snapshot-diff.png', 'excel-analyzer.png',
  'inventory-system.svg', 'invoice-ocr.png', 'toolkit-box.png', 'web-scraper.png',
];

describe('personal profile contract', () => {
  describe('1. 用户要完成什么：配置层不得承载个人档案', () => {
    it('keeps the blog site config free of profile-only avatar data', () => {
      for (const source of siteSources) {
        expect(source).not.toContain('avatarSrc');
        expect(source).not.toContain('availability');
        expect(source).not.toContain('skills');
      }
      expect(existsSync(resolve(root, 'public/images/profile/nice-avatar.png'))).toBe(false);
    });
  });

  describe('2. 页面要怎么走：首页与关于页不走共享 profile 组件', () => {
    it('keeps the shared profile component out of the home page', () => {
      expect(homeSource).not.toContain('ProfileIdentity');
    });

    it('keeps the shared profile component out of the about page', () => {
      expect(aboutSource).not.toContain('ProfileIdentity');
    });
  });

  describe('3. 空和失败怎么处理：残留组件与死资源必须清零', () => {
    it('removes the reusable profile component from the blog', () => {
      expect(existsSync(profileComponentPath)).toBe(false);
    });

    it('removes unused tool screenshots', () => {
      for (const file of obsoleteImages) {
        expect(existsSync(resolve(root, 'public/images/projects', file))).toBe(false);
      }
    });
  });

  describe('4. 界面为什么要这样排版：首页保留自身三组 studio 数据', () => {
    it('restores the three studio stats on the home page', () => {
      expect(homeSource).toContain('class="hero-studio__stats"');
      expect(homeSource).toContain('siteConfig.home.stats.delivery.value');
      expect(homeSource).toContain('siteConfig.home.stats.interaction.value');
    });
  });

  describe('5. 最后代码怎么落地：静态契约自检', () => {
    it('keeps every structured-data job title on the single author.role field', () => {
      // 后台改「作者 → 角色」后，站点级 Person 与简历页 ProfilePage 必须一起变；
      // 任何一份写死都会在搜索结果里留下与页面正文矛盾的陈旧职称。
      expect(homeSource).toContain('siteConfig.author.role');
      expect(read('src/layouts/BaseLayout.astro')).toContain('siteConfig.author.role');
      expect(resumeSource).toContain('jobTitle: siteConfig.author.role');
      expect(resumeSource).not.toMatch(/jobTitle:\s*['"]/);
    });

    it('reads every contract source so assertions cannot pass on empty input', () => {
      expect(siteSources).toHaveLength(3);
      expect(siteSources.every((source) => source.length > 0)).toBe(true);
      expect(homeSource.length).toBeGreaterThan(0);
      expect(aboutSource.length).toBeGreaterThan(0);
      expect(resumeSource.length).toBeGreaterThan(0);
    });
  });
});
