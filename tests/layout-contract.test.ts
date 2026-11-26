import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

function readStyleSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = `${dir}/${entry.name}`;
    if (entry.isDirectory()) return readStyleSources(entryPath);
    return /\.(astro|css)$/.test(entry.name) ? [entryPath] : [];
  });
}

describe('light monochrome layout', () => {
  it('keeps the article/project association wired through both detail layouts', () => {
    const articleLayout = read('src/layouts/ArticleLayout.astro');
    const projectLayout = read('src/layouts/ProjectLayout.astro');
    const articlePage = read('src/pages/articles/[id].astro');
    const projectPage = read('src/pages/projects/[id].astro');

    expect(articleLayout).toContain('ProjectCard');
    expect(articleLayout).toContain('project.id');
    expect(projectLayout).toContain('relatedArticles');
    expect(projectLayout).toContain('type="article"');
    expect(articlePage).toContain('findArticleProject');
    expect(articlePage).toContain('getArticleProjectIssue');
    expect(articlePage).toContain('groupArticlesIntoSeries');
    expect(articlePage).toContain('getArticlePager');
    expect(articlePage).toContain('getSeriesAwareRelated');
    expect(projectPage).toContain('getArticlesForProject');
  });

  it('renders article series groups and the in-series badge', () => {
    const articlesIndex = read('src/pages/articles/index.astro');
    const articleLayout = read('src/layouts/ArticleLayout.astro');

    expect(articlesIndex).toContain('groupArticlesIntoSeries');
    expect(articlesIndex).toContain('seriesTitleTemplate');
    expect(articlesIndex).toContain('seriesPositionTemplate');
    expect(articleLayout).toContain('seriesTemplate');
    expect(articleLayout).toContain('class="article-series"');
  });

  it('defines the global rhythm, container widths, and typography contract', () => {
    const globalStyles = read('src/styles/global.css');
    const header = read('src/components/Header.astro');

    expect(globalStyles).toContain('--content: 1280px;');
    expect(globalStyles).toContain('--content-narrow: 960px;');
    expect(globalStyles).toContain('--prose: 760px;');
    expect(globalStyles).toContain('--header-height: 64px;');
    expect(globalStyles).toContain('--radius-pill: 999px;');
    expect(globalStyles).toContain('text-wrap: balance;');
    expect(globalStyles).toContain('overflow-wrap: anywhere;');
    expect(globalStyles).toContain('width: min(calc(100% - 48px), var(--content));');
    expect(header).toContain('min-height: 44px;');
  });

  it('keeps the header as a floating glass pill', () => {
    const header = read('src/components/Header.astro');

    expect(header).toContain('class="header-pill"');
    expect(header).toContain('width: min(calc(100% - 32px), var(--content));');
    expect(header).toContain('border-radius: var(--radius-sm);');
    expect(header).toContain('background: var(--header-glass);');
    expect(header).toContain('backdrop-filter: blur(18px) saturate(140%);');
  });

  it('lays the home hero out as a gray studio block with a stats column', () => {
    const home = read('src/styles/home.css');
    const heroRule = home.match(/\.hero-studio\s*\{([^}]*)\}/)?.[1] ?? '';

    expect(heroRule).toContain('padding-block: clamp(72px, 9vw, 128px);');
    expect(heroRule).toContain('background: var(--surface-soft);');
    expect(home).toContain('grid-template-columns: minmax(0, 7fr) minmax(300px, 5fr);');
    expect(home).toContain('font-size: clamp(3.5rem, 7vw, 6rem);');
    expect(home).toMatch(/\.hero-studio__stats li \{[^}]*border-top: 1px solid var\(--border-strong\);/);
  });

  it('releases the hero stats into one column on narrow screens', () => {
    const home = read('src/styles/home.css');
    const mobile = home.slice(home.indexOf('@media (max-width: 768px) {'));

    expect.soft(mobile).toContain('font-size: clamp(2.5rem, 10vw, 2.75rem);');
    expect.soft(mobile).toMatch(/\.hero-studio__stats \{[^}]*grid-template-columns: 1fr;/);
  });

  it('uses white cards with a hairline border and scale-only image hover', () => {
    const card = read('src/components/ProjectCard.astro');
    const contentCard = read('src/components/ContentCard.astro');

    expect(card).toContain('border: 1px solid var(--border);');
    expect(card).toContain('border-radius: var(--radius-md);');
    expect(card).toContain('background: var(--surface);');
    expect(card).toContain('transform: scale(1.04);');
    expect(card).toContain('border-radius: var(--radius-pill);');
    expect(card).not.toContain('box-shadow');
    expect(contentCard).toContain('background: var(--surface);');
    expect(contentCard).toContain('background: var(--surface-soft);');
  });

  it('keeps project directory cards in one shared two-column grid', () => {
    const page = read('src/pages/projects/index.astro');
    const gallery = read('src/components/ProjectGallery.astro');

    expect(page).toContain('grid-template-columns: minmax(0, 1fr) auto;');
    expect(gallery).toContain('grid-template-columns: repeat(2, minmax(0, 1fr));');
  });

  it('uses a restrained split project hero and prose-aligned comments', () => {
    const layout = read('src/layouts/ProjectLayout.astro');

    expect(layout).toContain('grid-template-columns: minmax(0, 8fr) minmax(280px, 4fr);');
    expect(layout).toContain('font-size: clamp(2.5rem, 5vw, 3.6rem);');
    expect(layout).toContain('max-width: var(--prose);');
    expect(layout).toContain('<GiscusComments mapping="pathname" />');
    expect(layout).not.toContain('data-reveal');
  });

  it('caps the project detail title at 44px on narrow screens', () => {
    const layout = read('src/layouts/ProjectLayout.astro');
    const mobile = layout.slice(layout.indexOf('@media (max-width: 768px) {'));

    expect(mobile).toContain('font-size: clamp(2.5rem, 10vw, 2.75rem);');
  });

  it('keeps screenshot galleries readable with a light device frame', () => {
    const gallery = read('src/components/ProjectScreenshots.astro');
    const mobile = gallery.slice(gallery.indexOf('@media (max-width: 768px) {'));

    expect(gallery).toContain('grid-template-columns: minmax(220px, 4fr) minmax(0, 8fr);');
    expect(gallery).toContain('max-width: 380px;');
    expect(gallery).toContain('grid-template-columns: repeat(auto-fit, minmax(108px, 1fr));');
    expect(gallery).toContain('aspect-ratio: var(--screenshot-ratio, 16 / 10);');
    expect(gallery).toContain('border: 1px solid var(--border-strong);');
    expect(gallery).toContain('border-radius: 22px;');
    expect(gallery).not.toContain('#101d32');
    expect(gallery).not.toContain('data-reveal');
    expect(mobile).toMatch(/\.project-screenshots \{[^}]*grid-template-columns: 1fr;/);
    expect(mobile).toMatch(/\.project-screenshots__thumbnails \{[^}]*grid-auto-flow: column;/);
    expect(mobile).toMatch(/\.project-screenshots__thumbnails \{[^}]*grid-auto-columns: minmax\(132px, 44vw\);/);
    expect(mobile).toMatch(/\.project-screenshots__thumbnails \{[^}]*max-width: 100%;/);
    expect(mobile).toMatch(/\.project-screenshots__thumbnails \{[^}]*overflow-x: auto;/);
    expect(mobile).toMatch(/\.project-screenshots__thumbnails \{[^}]*scroll-snap-type: x proximity;/);
    expect(mobile).toMatch(/\.project-screenshots__thumbnail \{[^}]*scroll-snap-align: start;/);
  });

  it('integrates the guestbook explanation and GitHub discussion in one split layout', () => {
    const guestbook = read('src/pages/guestbook.astro');
    const comments = read('src/components/GiscusComments.astro');

    expect(guestbook).toContain('grid-template-columns: minmax(240px, 4fr) minmax(0, 8fr);');
    expect(guestbook).toContain('font-size: clamp(2.4rem, 4.6vw, 3.2rem);');
    expect(guestbook).toContain('mapping="specific" term="global-guestbook"');
    expect(comments).toContain('siteConfig.ui.comments');
    expect(read('src/data/site.json')).toContain('登录 GitHub 后即可参与');
  });

  it('caps the guestbook title at 44px on narrow screens', () => {
    const guestbook = read('src/pages/guestbook.astro');
    const mobile = guestbook.slice(guestbook.indexOf('@media (max-width: 768px) {'));

    expect(mobile).toContain('font-size: clamp(2.5rem, 10vw, 2.75rem);');
  });

  it('keeps every responsive breakpoint on the shared 480/640/768/1024 scale', () => {
    const allowed = new Set([480, 640, 768, 1024]);
    const breakpoints = readStyleSources('src').flatMap((file) =>
      [...read(file).matchAll(/@media \(max-width: (\d+)px\)/g)].map((match) => ({
        file,
        value: Number(match[1]),
      })),
    );

    expect(breakpoints.length).toBeGreaterThan(0);
    for (const { file, value } of breakpoints) {
      expect(allowed.has(value), `${file} 使用了未统一的断点 ${value}px`).toBe(true);
    }
  });
});
