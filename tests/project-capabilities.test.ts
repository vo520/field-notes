import { readdirSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { projectSchema } from '../src/lib/project-schema';
import { readProjectFrontmatter } from './_helpers/frontmatter';

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

// 五段式测试框架：
// 1. 用户要完成什么：公开项目能承载结构化的产品能力（模块/角色/流程/指标/集成）。
// 2. 空和失败怎么处理：能力记录缺名称/标签时 schema 拒绝，不让脏数据进入构建。
// 3. 界面为什么这样排版：能力面板由项目布局渲染，五个区块各有文案位。
// 4. 代码怎么落地：全量项目 frontmatter 通过 schema 校验，作为发布前的落地闸门。
// （本文件用例聚焦契约与渲染，无独立「页面流程」用例，该维度由布局接线用例间接覆盖。）

describe('project capability model', () => {
  const validProject = {
    title: '预约平台',
    description: '用于测试结构化产品能力。',
    publishedAt: '2026-07-17',
    status: 'active',
    category: '生活服务',
    tech: ['Astro'],
    cover: '/images/projects/bookingflow-platform/shot-1.png',
    repoUrl: 'https://github.com/vo520/bookingflow-admin',
    screenshots: Array.from({ length: 4 }, (_, index) => ({
      src: `/images/projects/bookingflow-platform/shot-${index + 1}.png`,
      alt: `预约页面 ${index + 1}`,
      title: `页面 ${index + 1}`,
      caption: '用于测试截图元数据。',
      viewport: index > 1 ? 'mobile' : 'desktop',
      width: index > 1 ? 390 : 1440,
      height: index > 1 ? 844 : 960,
    })),
    modules: [{ name: '预约中心', description: '管理预约和时段。', features: ['时段锁定', '改期'] }],
    roles: [{ name: '门店管理员', scope: '维护服务和排班' }],
    workflow: [{ label: '提交预约', status: '待确认' }],
    metrics: [{ label: '今日预约', value: '86', trend: '+14%' }],
    integrations: ['MySQL 8.4', 'Redis 8'],
  };

  describe('1. 用户要完成什么：承载结构化产品能力', () => {
    it('accepts structured capability fields on a published project', () => {
      const data = projectSchema.parse(validProject);

      expect(data.modules?.[0]?.features).toContain('时段锁定');
      expect(data.roles?.[0]?.scope).toContain('排班');
      expect(data.workflow?.[0]?.status).toBe('待确认');
      expect(data.metrics?.[0]?.trend).toBe('+14%');
      expect(data.integrations).toContain('Redis 8');
    });
  });

  describe('2. 空和失败怎么处理：残缺能力记录直接拒绝', () => {
    it('rejects capability records without required names and labels', () => {
      expect(() => projectSchema.parse({
        ...validProject,
        modules: [{ name: '', description: '缺少模块名', features: ['功能'] }],
      })).toThrow();
      expect(() => projectSchema.parse({
        ...validProject,
        workflow: [{ label: '', status: '待确认' }],
      })).toThrow();
    });
  });

  describe('3. 界面为什么这样排版：能力面板由布局渲染', () => {
    it('renders the capability panel from the project layout', () => {
      const panel = read('src/components/ProjectCapabilityPanel.astro');
      const layout = read('src/layouts/ProjectLayout.astro');

      expect(panel).toContain('data-project-capabilities');
      expect(panel).toContain('siteConfig.projectPage.capabilities');
      expect(panel).toContain('{copy.modules}');
      expect(panel).toContain('{copy.roles}');
      expect(panel).toContain('{copy.workflow}');
      expect(panel).toContain('{copy.metrics}');
      expect(layout).toContain('<ProjectCapabilityPanel');
    });
  });

  describe('4. 代码怎么落地：全量内容过闸门', () => {
    it('keeps every published project free of unverifiable capability claims', () => {
      const slugs = readdirSync('src/content/projects', { withFileTypes: true })
        .filter((entry) => entry.isFile() && /\.mdx?$/.test(entry.name))
        .map((entry) => entry.name.replace(/\.mdx?$/, ''));

      expect(slugs.length).toBeGreaterThan(0);
      for (const slug of slugs) {
        expect(projectSchema.safeParse(readProjectFrontmatter(slug)).success, slug).toBe(true);
      }
    });
  });
});
