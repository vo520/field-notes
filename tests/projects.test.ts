import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { extname } from 'node:path';

import { describe, expect, it } from 'vitest';
import { parse as parseYaml } from 'yaml';

import {
  getProjectPublishingIssues,
  isPublishableProject,
  projectSchema,
} from '../src/lib/project-schema';
import { isDraftFlag } from '../src/lib/publishing-rules';
import { siteConfig } from '../src/config/site';
import {
  getProjectCategoryStats,
  getProjectCategoryUrl,
  parseProjectCategory,
  projectCategories,
} from '../src/lib/projects';
import { readProjectFrontmatter } from './_helpers/frontmatter';

const baseProject = {
  title: '示例网站',
  description: '解决一个明确问题。',
  publishedAt: '2026-07-14',
  status: 'completed' as const,
  category: '个人品牌' as const,
  tech: ['TypeScript'],
  draft: false,
};

const screenshot = {
  src: '/images/projects/example/home.png',
  alt: '示例网站首页',
  title: '网站首页',
  caption: '展示网站的主要入口。',
  viewport: 'desktop' as const,
  width: 1440,
  height: 900,
};

function createScreenshots(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    ...screenshot,
    src: `/images/projects/example/screen-${index + 1}.png`,
  }));
}

function readOptional(path: string): string {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

describe('project publishing rules', () => {
  it('keeps a project without a cover and repository out of publication', () => {
    const project = projectSchema.parse({
      ...baseProject,
      screenshots: createScreenshots(4),
    });

    expect(isPublishableProject(project)).toBe(false);
    expect(getProjectPublishingIssues(project).map((issue) => issue.path)).toEqual([
      'cover',
      'repoUrl',
    ]);
  });

  it('allows an incomplete project only while it remains a draft', () => {
    const draft = projectSchema.parse({ ...baseProject, draft: true });

    expect(getProjectPublishingIssues(draft)).toEqual([]);
    expect(isPublishableProject(draft)).toBe(false);
  });

  it('accepts a public project with a local cover and GitHub repository', () => {
    const project = projectSchema.parse({
      ...baseProject,
      cover: '/images/projects/example.png',
      repoUrl: 'https://github.com/vo520/example',
      screenshots: createScreenshots(4),
    });
    expect(isPublishableProject(project)).toBe(true);
  });

  it('publishes a project without screenshots when a generated cover is present', () => {
    const publicProject = {
      ...baseProject,
      cover: '/images/projects/example.png',
      repoUrl: 'https://github.com/vo520/example',
    };

    expect(isPublishableProject(projectSchema.parse(publicProject))).toBe(true);
    expect(isPublishableProject(projectSchema.parse({ ...publicProject, draft: true }))).toBe(false);
  });

  it('requires a source URL for public projects and forbids one for private projects', () => {
    const project = {
      ...baseProject,
      cover: '/images/projects/example.png',
    };

    const missingSource = projectSchema.parse({ ...project, sourceVisibility: 'public' });
    expect(getProjectPublishingIssues(missingSource).map((issue) => issue.path)).toEqual(['repoUrl']);

    const leakedSource = projectSchema.parse({
      ...project,
      sourceVisibility: 'private',
      repoUrl: 'https://gitee.com/vo520/example',
    });
    expect(getProjectPublishingIssues(leakedSource).map((issue) => issue.path)).toEqual(['repoUrl']);

    const privateProject = projectSchema.parse({ ...project, sourceVisibility: 'private' });
    expect(getProjectPublishingIssues(privateProject)).toEqual([]);
    expect(isPublishableProject(privateProject)).toBe(true);
  });

  it('treats the empty values the CMS writes as not provided', () => {
    // 后台把未填写的可选项写成空数组、空字符串或 null，不应让整站构建失败
    const project = projectSchema.parse({
      ...baseProject,
      cover: '/images/projects/example.png',
      repoUrl: 'https://github.com/vo520/example',
      tech: '',
      sourceVisibility: '',
      repositories: [],
      demoUrl: '',
      repoLabel: '',
    });

    expect(project.tech).toEqual([]);
    expect(project.sourceVisibility).toBe('public');
    expect(project.repositories).toBeUndefined();
    expect(project.demoUrl).toBeUndefined();
    expect(project.repoLabel).toBeUndefined();
    expect(isPublishableProject(project)).toBe(true);
  });

  it('drops blank list entries the CMS may save', () => {
    // 后台 list 控件加了一行却没填内容时会留下 ""，剔除后不应让整站构建失败
    const project = projectSchema.parse({
      ...baseProject,
      cover: '/images/projects/example.png',
      repoUrl: 'https://github.com/vo520/example',
      tech: ['TypeScript', '', '  '],
      integrations: ['', ' '],
      modules: [{ name: '预约', description: '在线预约登记。', features: ['', '预约下单'] }],
      repositories: [{
        name: 'example-web',
        role: 'frontend',
        description: '网站前台。',
        tech: ['', 'Vue 3'],
        url: 'https://github.com/vo520/example-web',
      }],
    });

    expect(project.tech).toEqual(['TypeScript']);
    expect(project.integrations).toBeUndefined();
    expect(project.modules?.[0]?.features).toEqual(['预约下单']);
    expect(project.repositories?.[0]?.tech).toEqual(['Vue 3']);
  });

  it('reads draft and featured flags written as YAML booleans', () => {
    // 手写 YAML 常见 draft: True / draft: 'true'，需要归一成布尔值
    const project = projectSchema.parse({
      ...baseProject,
      cover: '/images/projects/example.png',
      repoUrl: 'https://github.com/vo520/example',
      draft: 'True',
      featured: 'false',
    });

    expect(project.draft).toBe(true);
    expect(project.featured).toBe(false);
    expect(isPublishableProject(project)).toBe(false);
    expect(isDraftFlag(project.draft)).toBe(true);
  });

  it('accepts the four and six screenshot publishing boundaries', () => {
    const publicProject = {
      ...baseProject,
      cover: '/images/projects/example.png',
      repoUrl: 'https://github.com/vo520/example',
    };

    expect(projectSchema.safeParse({
      ...publicProject,
      screenshots: createScreenshots(4),
    }).success).toBe(true);
    expect(projectSchema.safeParse({
      ...publicProject,
      screenshots: createScreenshots(6),
    }).success).toBe(true);
  });

  it('rejects the three and seven screenshot publishing boundaries', () => {
    const publicProject = {
      ...baseProject,
      cover: '/images/projects/example.png',
      repoUrl: 'https://github.com/vo520/example',
    };

    expect(projectSchema.safeParse({
      ...publicProject,
      screenshots: createScreenshots(3),
    }).success).toBe(false);
    expect(projectSchema.safeParse({
      ...publicProject,
      screenshots: createScreenshots(7),
    }).success).toBe(false);
  });

  it('rejects malformed screenshot metadata', () => {
    const screenshots = Array.from({ length: 4 }, () => screenshot);
    const publicProject = {
      ...baseProject,
      cover: '/images/projects/example.png',
      repoUrl: 'https://github.com/vo520/example',
      screenshots: createScreenshots(4),
    };

    expect(projectSchema.safeParse({
      ...publicProject,
      screenshots: [{ ...screenshot, viewport: 'tablet' }, ...screenshots.slice(1)],
    }).success).toBe(false);
    expect(projectSchema.safeParse({
      ...publicProject,
      screenshots: [{ ...screenshot, width: 0 }, ...screenshots.slice(1)],
    }).success).toBe(false);
  });

  it('accepts repository nodes only when every URL is GitHub or Gitee HTTPS', () => {
    const validRepository = {
      name: 'example-web',
      role: 'frontend',
      description: '网站前台。',
      tech: ['Vue 3'],
      url: 'https://github.com/vo520/example-web',
    };

    expect(projectSchema.safeParse({
      ...baseProject,
      cover: '/images/projects/example.png',
      repoUrl: 'https://github.com/vo520/example',
      screenshots: createScreenshots(4),
      repositories: [validRepository],
    }).success).toBe(true);
    expect(projectSchema.safeParse({
      ...baseProject,
      cover: '/images/projects/example.png',
      repoUrl: 'https://github.com/vo520/example',
      screenshots: createScreenshots(4),
      repositories: [{ ...validRepository, url: 'https://gitee.com/vo520/example-web' }],
    }).success).toBe(true);
    expect(projectSchema.safeParse({
      ...baseProject,
      cover: '/images/projects/example.png',
      repoUrl: 'https://github.com/vo520/example',
      screenshots: createScreenshots(4),
      repositories: [{ ...validRepository, url: 'http://github.com/vo520/example-web' }],
    }).success).toBe(false);
    expect(projectSchema.safeParse({
      ...baseProject,
      cover: '/images/projects/example.png',
      repoUrl: 'https://github.com/vo520/example',
      screenshots: createScreenshots(4),
      repositories: [{ ...validRepository, url: 'https://example.com/example-web' }],
    }).success).toBe(false);
  });

  it('drops non-HTTPS demo and repository links instead of failing the build', () => {
    const publicProject = {
      ...baseProject,
      cover: '/images/projects/example.png',
      repoUrl: 'https://github.com/vo520/example',
    };

    // 后台 pattern 只做前缀匹配：`https://` 这类值能保存但无法通过 z.url()，必须归一为「未提供」
    expect(projectSchema.parse(publicProject).demoUrl).toBeUndefined();
    expect(projectSchema.parse({ ...publicProject, demoUrl: 'https://' }).demoUrl).toBeUndefined();
    expect(projectSchema.parse({ ...publicProject, demoUrl: 'ftp://example.com/demo' }).demoUrl).toBeUndefined();
    expect(projectSchema.parse({ ...publicProject, demoUrl: 'https://example.com/demo' }).demoUrl)
      .toBe('https://example.com/demo');

    // 非法源码地址归一为未提供后，公开项目由发布闸门拒绝发布并输出原因
    const leakedSource = projectSchema.parse({ ...publicProject, repoUrl: 'ftp://github.com/vo520/example' });
    expect(leakedSource.repoUrl).toBeUndefined();
    expect(isPublishableProject(leakedSource)).toBe(false);
  });

  it('keeps every published project on a real Gitee or GitHub source', () => {
    const slugs = readdirSync('src/content/projects', { withFileTypes: true })
      .filter((entry) => entry.isFile() && ['.md', '.mdx'].includes(extname(entry.name)))
      .map((entry) => entry.name.replace(/\.mdx?$/, ''));

    expect(slugs.length).toBeGreaterThan(0);
    for (const slug of slugs) {
      const project = projectSchema.parse(readProjectFrontmatter(slug));
      // 草稿和违反发布红线的项目不会进入构建产物，只校验实际会发布的项目
      if (!isPublishableProject(project)) continue;

      if (project.sourceVisibility === 'public') {
        expect(project.repoUrl, slug).toMatch(/^https:\/\/(?:github|gitee)\.com\//);
      } else {
        expect(project.repoUrl, slug).toBeUndefined();
      }
      expect(existsSync(`public${project.cover}`), slug).toBe(true);
    }
  });
});

describe('project category helpers', () => {
  it('uses the fixed public category order', () => {
    expect(projectCategories).toEqual([
      '个人品牌',
      '电商平台',
      '社区服务',
      '企业官网',
      '门店经营',
      '供应链管理',
      '教育培训',
      '物流运输',
      '医疗健康',
      '人力资源',
      '财务管理',
      '销售管理',
      '合同管理',
      '物业服务',
      '客户服务',
      '文体活动',
      '零售餐饮',
      '生活服务',
      '工业能源',
      '售后服务',
      '采购供应链',
      '旅游住宿',
      '内容创作',
      '法律服务',
      '场馆运营',
    ]);
  });

  it('keeps the CMS select options aligned with the schema enums', () => {
    const config = parseYaml(readFileSync('public/admin/config.yml', 'utf8')) as {
      collections: Array<{
        name: string;
        fields: Array<{ name: string; options?: Array<string | { value: string }> }>;
      }>;
    };
    const fields = config.collections.find((collection) => collection.name === 'projects')?.fields ?? [];
    const optionsOf = (name: string) => fields.find((field) => field.name === name)?.options;

    expect(optionsOf('category')).toEqual([...projectCategories]);
    expect(optionsOf('status')?.map((option) => (typeof option === 'string' ? option : option.value)))
      .toEqual(['active', 'completed', 'archived']);
  });

  it('keeps every CMS field pattern compilable and free of double-escaped backslashes', () => {
    const source = readFileSync('public/admin/config.yml', 'utf8');
    const patterns = [...source.matchAll(/pattern:\s*\[\s*'([^']+)'/g)]
      .map((match) => match[1])
      .filter((pattern): pattern is string => Boolean(pattern));

    expect(patterns.length).toBeGreaterThan(0);
    for (const pattern of patterns) {
      // YAML 单引号里的 `\\S` 会变成正则里的「反斜杠 + S」，合法链接会被后台误判
      expect(pattern, pattern).not.toContain('\\\\');
      expect(() => new RegExp(pattern), pattern).not.toThrow();
    }

    for (const pattern of patterns.filter((pattern) => pattern.includes('https'))) {
      expect(new RegExp(pattern).test('https://github.com/vo520'), pattern).toBe(true);
    }

    // 模板字段：hint 声明的占位符必须真的出现在 pattern 里，否则后台拦不住漏占位符
    const templateLines = source.split('\n').filter((line) => line.includes('必须包含'));
    expect(templateLines.length).toBeGreaterThan(0);
    for (const line of templateLines) {
      const field = line.trim();
      expect(field, field).toContain('pattern:');
      const patternPart = field.slice(field.indexOf('pattern:'));
      const placeholders = [...field.matchAll(/\{(\w+)\}/g)]
        .map((match) => match[1])
        .filter((placeholder): placeholder is string => Boolean(placeholder));
      for (const placeholder of placeholders) {
        expect(patternPart, field).toContain(`\\{${placeholder}\\}`);
      }
    }
  });

  it('keeps every schema template field guarded by an equivalent CMS pattern', () => {
    // 以 schema 为准反查后台：新增 template() 字段却漏配 pattern，这里会直接失败
    const expected = new Map<string, string[][]>();
    for (const match of readFileSync('src/lib/site-schema.ts', 'utf8').matchAll(/(\w+): template\(([^)]*)\)/g)) {
      const name = match[1] ?? '';
      const placeholders = [...(match[2] ?? '').matchAll(/'\{(\w+)\}'/g)]
        .map((placeholder) => placeholder[1])
        .filter((placeholder): placeholder is string => Boolean(placeholder));
      expected.set(name, [...(expected.get(name) ?? []), placeholders]);
    }
    expect(expected.size).toBeGreaterThan(0);

    for (const line of readFileSync('public/admin/config.yml', 'utf8').split('\n')) {
      const fieldName = /name: (\w+Template)\b/.exec(line)?.[1];
      if (!fieldName) continue;
      const queue = expected.get(fieldName);
      expect(queue, `${fieldName} 在 site-schema.ts 中没有对应的 template() 字段`).toBeDefined();
      if (!queue) continue;
      const placeholders = queue.shift();
      const guarded = [...line.matchAll(/\\\{(\w+)\\\}/g)]
        .map((placeholder) => placeholder[1])
        .filter((placeholder): placeholder is string => Boolean(placeholder));
      expect(new Set(guarded), `${fieldName} 的 CMS pattern 与 schema 占位符不一致`).toEqual(new Set(placeholders));
    }

    expected.forEach((queues, name) => {
      expect(queues, `${name} 在后台配置里缺少 pattern 校验`).toHaveLength(0);
    });
  });

  it('introduces the directory as real Gitee and GitHub projects', () => {
    const projectsPage = readFileSync('src/pages/projects/index.astro', 'utf8');

    expect(projectsPage).toContain('siteConfig.projectsPage');
    expect(siteConfig.projectsPage.heading).toContain('Gitee');
    expect(siteConfig.projectsPage.heading).toContain('GitHub');
    expect(siteConfig.projectsPage.intro).toContain('每张卡片对应一个真实仓库');
  });

  it('returns every configured category with a public project count', () => {
    expect(getProjectCategoryStats([
      { data: { category: '个人品牌' as const } },
      { data: { category: '个人品牌' as const } },
    ])).toEqual([
      { category: '个人品牌', count: 2 },
      { category: '电商平台', count: 0 },
      { category: '社区服务', count: 0 },
      { category: '企业官网', count: 0 },
      { category: '门店经营', count: 0 },
      { category: '供应链管理', count: 0 },
      { category: '教育培训', count: 0 },
      { category: '物流运输', count: 0 },
      { category: '医疗健康', count: 0 },
      { category: '人力资源', count: 0 },
      { category: '财务管理', count: 0 },
      { category: '销售管理', count: 0 },
      { category: '合同管理', count: 0 },
      { category: '物业服务', count: 0 },
      { category: '客户服务', count: 0 },
      { category: '文体活动', count: 0 },
      { category: '零售餐饮', count: 0 },
      { category: '生活服务', count: 0 },
      { category: '工业能源', count: 0 },
      { category: '售后服务', count: 0 },
      { category: '采购供应链', count: 0 },
      { category: '旅游住宿', count: 0 },
      { category: '内容创作', count: 0 },
      { category: '法律服务', count: 0 },
      { category: '场馆运营', count: 0 },
    ]);
  });

  it('restores only a configured category from the query string', () => {
    expect(parseProjectCategory('社区服务')).toBe('社区服务');
    expect(parseProjectCategory('不存在的分类')).toBe('全部');
    expect(parseProjectCategory(null)).toBe('全部');
  });

  it('sets a configured category while preserving other URL parts', () => {
    expect(getProjectCategoryUrl(
      'https://example.com/projects/?sort=recent#gallery',
      '社区服务',
    )).toBe(
      'https://example.com/projects/?sort=recent&category=%E7%A4%BE%E5%8C%BA%E6%9C%8D%E5%8A%A1#gallery',
    );
  });

  it('removes only the category parameter for the all filter', () => {
    expect(getProjectCategoryUrl(
      'https://example.com/projects/?category=%E7%94%B5%E5%95%86%E5%B9%B3%E5%8F%B0&sort=recent',
      '全部',
    )).toBe('https://example.com/projects/?sort=recent');
  });

  it('gives project filters a 44px minimum height in their base rule', () => {
    const gallery = readFileSync('src/components/ProjectGallery.astro', 'utf8');

    expect(gallery).toMatch(/\.project-filters button \{[^}]*min-height: 44px;/);
  });

  it('keeps filtered project cards visually hidden despite their flex layout', () => {
    const card = readFileSync('src/components/ProjectCard.astro', 'utf8');

    expect(card).toMatch(/\.project-card\[hidden\] \{[^}]*display: none;/);
  });

  it('renders every project image at the real 1440 by 900 ratio without cropping', () => {
    const card = readFileSync('src/components/ProjectCard.astro', 'utf8');
    const layout = readFileSync('src/layouts/ProjectLayout.astro', 'utf8');

    for (const source of [card, layout]) {
      expect(source).toContain('width="1440" height="900"');
      expect(source).toContain('aspect-ratio: 16 / 10;');
      expect(source).toContain('object-fit: contain;');
    }
    expect(card).not.toContain('aspect-ratio: auto;');
  });

  it('documents single-repository, multi-repository, and hidden showcase conventions', () => {
    const readme = readFileSync('README.md', 'utf8');

    expect(readme).toContain('单仓项目使用 `repoUrl`');
    expect(readme).toContain('多仓项目使用 `repositories`');
    expect(readme).toContain('`showcase/` 保留的是已隐藏工具项目的脱敏源码快照');
    expect(readme).toContain('不会出现在网站项目列表');
  });

  it('renders every related repository as a semantic product panorama', () => {
    const layout = readFileSync('src/layouts/ProjectLayout.astro', 'utf8');
    const constellation = readOptional('src/components/RepositoryConstellation.astro');

    expect.soft(layout).toContain('{siteConfig.projectPage.panorama.title}');
    expect.soft(layout).toContain('<RepositoryConstellation repositories={data.repositories ?? []} />');
    expect.soft(constellation).toContain('<ul');
    expect.soft(constellation).toContain('repositories.map((repository)');
    expect.soft(constellation).toContain('{repository.name}');
    expect.soft(constellation).toContain('{roleLabels[repository.role]}');
    expect.soft(constellation).toContain('{repository.description}');
    expect.soft(constellation).toContain('repository.tech.map');
    expect.soft(constellation).toContain('href={repository.url}');
    expect.soft(constellation).toContain('target="_blank"');
    expect.soft(constellation).toContain('rel="noopener noreferrer"');
  });

  it('describes single and multi-repository products without contradicting their structure', () => {
    const layout = readFileSync('src/layouts/ProjectLayout.astro', 'utf8');

    expect.soft(layout).toContain(
      'const hasMultipleRepositories = (data.repositories?.length ?? 0) > 1;',
    );
    expect.soft(layout).toContain('hasMultipleRepositories');
    expect.soft(layout).toContain('siteConfig.projectPage.panorama.descriptionMultiple');
    expect.soft(layout).toContain('siteConfig.projectPage.panorama.descriptionSingle');
  });

  it('treats a missing or explicitly empty repositories list as the primary repository', () => {
    const card = readFileSync('src/components/ProjectCard.astro', 'utf8');

    expect.soft(card).toContain('const repositoryCount = repositories?.length || 1;');
    expect.soft(card).not.toContain('repositories?.length ?? 1');
    expect.soft(card.match(/repositoryCount/g)).toHaveLength(4);
  });

  it('keeps product descriptions readable instead of truncating them to one line', () => {
    const card = readFileSync('src/components/ProjectCard.astro', 'utf8');
    const descriptionRule = card.match(/\.project-card__description\s*\{([^}]*)\}/)?.[1] ?? '';

    expect.soft(card).toContain('class="project-card__description"');
    expect.soft(descriptionRule).not.toContain('white-space: nowrap');
    expect.soft(descriptionRule).not.toContain('text-overflow: ellipsis');
  });

  it('does not restore the old tool-category explainer grid', () => {
    const home = readFileSync('src/pages/index.astro', 'utf8');
    const projectsPage = readFileSync('src/pages/projects/index.astro', 'utf8');

    expect.soft(home).not.toContain('<ProjectCategoryGrid');
    expect.soft(projectsPage).not.toContain('categoryDescriptions');
    expect.soft(projectsPage).not.toContain('project-catalog__categories');
    expect.soft(projectsPage).not.toContain('grid-template-columns: repeat(5');
  });
});
