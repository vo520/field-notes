import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { siteConfig } from '../src/config/site';

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

describe('personal brand configuration', () => {
  it('uses the Nice identity and full-stack positioning', () => {
    expect(siteConfig.name).toBe('Nice 个人博客');
    expect(siteConfig.brand).toBe('NICE / FULL-STACK ENGINEER');
    expect(siteConfig.brandMark).toBe('N');
    expect(siteConfig.author).toMatchObject({
      name: 'Nice',
      role: '全栈工程师',
    });
  });

  it('publishes the authenticated GitHub and Gitee profiles without exposing email', () => {
    expect(siteConfig.social.github).toBe('https://github.com/vo520');
    expect(siteConfig.social.gitee).toBe('https://gitee.com/vo520');
    expect(siteConfig.social.email).toBe('');
  });

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

  it('presents the home page as a light project studio', () => {
    const home = readText('src/pages/index.astro');
    const card = readText('src/components/ProjectCard.astro');

    expect.soft(home).toContain('class="hero-studio"');
    expect.soft(home).toContain('把复杂业务，做成可运行的产品。');
    expect.soft(home).toContain('class="hero-studio__stats"');
    expect.soft(home).toContain('全栈交付');
    expect.soft(home).toContain('aria-label={`${projects.length} 个项目`}');
    expect.soft(home).toContain('data-project-count={projects.length}');
    expect.soft(home).toContain('站内互动');
    expect.soft(home).toContain('data-free-open-source');
    expect.soft(home).not.toContain('data-cosmic-hero');
    expect.soft(card).not.toContain('data-cosmic-card');
  });

  it('caps the mobile hero title at the 44px design maximum', () => {
    const home = readText('src/styles/home.css');
    const mobileHeroRule = home.match(
      /@media \(max-width: 760px\) \{[\s\S]*?\.hero-studio h1 \{([^}]*)\}/,
    )?.[1] ?? '';

    expect.soft(mobileHeroRule).toContain('font-size: clamp(2.5rem, 10vw, 2.75rem);');
    expect.soft(mobileHeroRule).not.toContain('3.5rem');
  });

  it('keeps the hero on the neutral gray block without decorative orbits', () => {
    const home = readText('src/styles/home.css');
    const heroRule = home.match(/\.hero-studio\s*\{([^}]*)\}/)?.[1] ?? '';

    expect.soft(heroRule).toContain('background: var(--surface-soft);');
    expect.soft(home).not.toContain('.hero-studio::before');
    expect.soft(home).not.toContain('.hero-studio::after');
  });
});
