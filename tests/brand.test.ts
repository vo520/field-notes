import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { siteConfig } from '../src/config/site';
import { siteSchema } from '../src/lib/site-schema';

const readText = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const collectStyleSourcePaths = (directory: string): string[] =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name).replaceAll('\\', '/');
    if (entry.isDirectory()) return collectStyleSourcePaths(path);
    return /\.(?:astro|css)$/.test(entry.name) ? [path] : [];
  });

const styleSourcePaths = collectStyleSourcePaths('src').sort();

const findStyleViolations = (pattern: RegExp) =>
  styleSourcePaths.flatMap((path) =>
    [...readText(path).matchAll(pattern)].map((match) => `${path}: ${match[0]}`),
  );

// 五段式测试框架：
// 1. 用户要完成什么：站点身份明确（Nice / 全栈工程师），社交入口真实可达。
// 2. 页面要怎么走：二维码走站内路径，主题切换 localStorage，路由进首页工作室视图。
// 3. 空和失败怎么处理：非法二维码路径被 schema 拒绝，二维码留空也合法。
// 4. 界面为什么这样排版：亮色优先单色、系统字体栈、明暗令牌齐全、移动端标题封顶 44px。
// 5. 最后代码怎么落地：全量样式源统一字体排版，工作室灰块无装饰轨道。

describe('personal brand configuration', () => {
  describe('1. 用户要完成什么：身份与联系方式明确', () => {
    it('uses the Nice identity and full-stack positioning', () => {
      expect(siteConfig.name).toBe('Nice 个人博客');
      expect(siteConfig.brand).toBe('NICE / FULL-STACK ENGINEER');
      expect(siteConfig.brandMark).toBe('N');
      expect(siteConfig.author).toMatchObject({
        name: 'Nice',
        role: '全栈工程师',
      });
    });

    it('publishes the authenticated GitHub, Gitee, email and WeChat contacts', () => {
      expect(siteConfig.social.github).toBe('https://github.com/vo520');
      expect(siteConfig.social.gitee).toBe('https://gitee.com/vo520');
      expect(siteConfig.social.email).toBe('854022828@qq.com');
      expect(siteConfig.social.wechat).toBe('15014002756');
      expect(
        siteConfig.social.wechatQr === '' || siteConfig.social.wechatQr.startsWith('/images/'),
        '微信二维码应为空或 /images 下的站内路径',
      ).toBe(true);
    });
  });

  describe('2. 页面要怎么走：主题与入口接线', () => {
    it('uses the light-first monochrome visual contract with a system font stack', () => {
      const packageJson = JSON.parse(readText('package.json')) as {
        dependencies?: Record<string, string>;
      };
      const globalStyles = readText('src/styles/global.css');
      const layout = readText('src/layouts/BaseLayout.astro');
      const header = readText('src/components/Header.astro');
      const footer = readText('src/components/Footer.astro');

      expect(packageJson.dependencies ?? {}).not.toHaveProperty('@fontsource-variable/inter');
      expect(packageJson.dependencies ?? {}).not.toHaveProperty('@fontsource-variable/noto-sans-sc');
      expect(layout).not.toContain('@fontsource');
      expect(globalStyles).toContain('--font-sans: -apple-system, BlinkMacSystemFont,');
      expect(globalStyles).toContain('--font-mono: ui-monospace, SFMono-Regular,');
      expect(globalStyles).toContain(':focus-visible {\n  outline: 2px solid var(--focus-ring);');
      expect(globalStyles).toContain('.skip-link:focus-visible {');
      expect(globalStyles).not.toContain('.skip-link:focus {');
      expect(layout).toContain("localStorage.getItem('site-theme')");
      expect(layout).not.toContain('observatory');
      expect(layout).not.toContain('Cosmic');
      expect(header).toContain('<ThemeToggle />');
      expect(header).toContain('var(--header-glass)');
      expect(header).toContain('backdrop-filter: blur(');
      expect(footer).toContain('background: var(--surface-soft);');
      expect(footer).not.toContain('backdrop-filter');
    });
  });

  describe('3. 空和失败怎么处理：二维码路径受控', () => {
    it('accepts only site-local image paths for the WeChat QR code', () => {
      const base = siteSchema.parse(JSON.parse(readText('src/data/site.json')));
      const withQr = (wechatQr: unknown) => ({ ...base, social: { ...base.social, wechatQr } });

      expect(siteSchema.parse(withQr('/images/uploads/wechat-qr.png')).social.wechatQr)
        .toBe('/images/uploads/wechat-qr.png');
      expect(siteSchema.parse(withQr('')).social.wechatQr).toBe('');
      expect(siteSchema.parse(withQr(null)).social.wechatQr).toBe('');

      for (const invalid of [
        'https://example.com/qr.png',
        'images/qr.png',
        '/images/../qr.png',
        '/images/QR.png',
        '/images/qr_code.png',
        '/images/qr.gif',
      ]) {
        expect(() => siteSchema.parse(withQr(invalid)), invalid).toThrow();
      }
    });
  });

  describe('4. 界面为什么这样排版：亮色优先与明暗令牌', () => {
    it('defines light and dark token blocks on the root element', () => {
      const globalStyles = readText('src/styles/global.css');
      const themeTokens = (theme: string) =>
        globalStyles.match(new RegExp(`:root\\[data-theme='${theme}'\\]\\s*\\{([^}]*)\\}`))?.[1] ?? '';

      expect.soft(globalStyles).toContain(":root,\n:root[data-theme='light'] {");
      expect.soft(globalStyles).not.toMatch(/^\[data-theme=/m);
      expect.soft(themeTokens('light')).toContain('--canvas: #ffffff');
      expect.soft(themeTokens('light')).toContain('--surface-soft: #f1f2f4');
      expect.soft(themeTokens('light')).toContain('--ink: #282828');
      expect.soft(themeTokens('light')).toContain('--accent: #000000');
      expect.soft(themeTokens('light')).toContain('--border: rgba(0, 0, 0, 0.08)');
      expect.soft(themeTokens('dark')).toContain('--canvas: #141414');
      expect.soft(themeTokens('dark')).toContain('--ink: #f2f2f2');
      expect.soft(themeTokens('dark')).toContain('--accent: #ffffff');
    });

    it('presents the home page as a light project studio', () => {
      const home = readText('src/pages/index.astro');
      const card = readText('src/components/ProjectCard.astro');

      expect.soft(home).toContain('class="hero-studio"');
      expect.soft(siteConfig.home.heroTitle).toBe('把复杂业务，做成可运行的产品。');
      expect.soft(home).toContain('{siteConfig.home.heroTitle}');
      expect.soft(home).toContain('class="hero-studio__stats"');
      expect.soft(siteConfig.home.stats.delivery.value).toBe('全栈交付');
      expect.soft(home).toContain('{siteConfig.home.stats.delivery.value}');
      expect.soft(home).toContain('siteConfig.ui.projectCountAriaTemplate');
      expect.soft(home).toContain('data-project-count={projects.length}');
      expect.soft(siteConfig.home.stats.interaction.value).toBe('站内互动');
      expect.soft(home).toContain('{siteConfig.home.stats.interaction.value}');
      expect.soft(home).toContain('data-free-open-source');
      expect.soft(home).not.toContain('data-cosmic-hero');
      expect.soft(card).not.toContain('data-cosmic-card');
    });

    it('caps the mobile hero title at the 44px design maximum', () => {
      const home = readText('src/styles/home.css');
      const mobileHeroRule = home.match(
        /@media \(max-width: 768px\) \{[\s\S]*?\.hero-studio h1 \{([^}]*)\}/,
      )?.[1] ?? '';

      expect.soft(mobileHeroRule).toContain('font-size: clamp(2.5rem, 10vw, 2.75rem);');
      expect.soft(mobileHeroRule).not.toContain('3.5rem');
    });
  });

  describe('5. 最后代码怎么落地：样式源统一，无装饰残留', () => {
    it('normalizes typography across every Astro and CSS style source', () => {
      const globalStyles = readText('src/styles/global.css');

      expect.soft(globalStyles).toContain('font-family: var(--font-sans);');
      expect.soft(findStyleViolations(/\bGeist(?: Mono)?\b/g)).toEqual([]);
      expect.soft(
        findStyleViolations(/font-weight:\s*(?!(?:300|400|500|600|700)\b)\d+\b/g),
      ).toEqual([]);
      expect.soft(findStyleViolations(/letter-spacing:\s*-[^;]+/g)).toEqual([]);
      expect.soft(findStyleViolations(/letter-spacing:[^;]*!important/g)).toEqual([]);
    });

    it('keeps the hero on the neutral gray block without decorative orbits', () => {
      const home = readText('src/styles/home.css');
      const heroRule = home.match(/\.hero-studio\s*\{([^}]*)\}/)?.[1] ?? '';

      expect.soft(heroRule).toContain('background: var(--surface-soft);');
      expect.soft(home).not.toContain('.hero-studio::before');
      expect.soft(home).not.toContain('.hero-studio::after');
    });
  });
});
