import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const read = (path: string) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

// 五段式测试框架：
// 1. 用户要完成什么：渐进式画廊可用——说明、缩略图、弹窗控件与无脚本回退齐全。
// 2. 页面要怎么走：说明文案先于视觉舞台渲染，读者先读上下文再看图。
// 3. 空和失败怎么处理：无脚本回退与减少动效偏好都有兜底，标题 id 由调用方稳定提供。
// 4. 界面为什么这样排版：桌面等比缩放、移动设备外框，画廊嵌在全景之前。
// 5. 最后代码怎么落地：布局按项目 id 派生 headingId 并接线到组件。

describe('project screenshot gallery', () => {
  describe('1. 用户要完成什么：渐进式画廊可用', () => {
    it('renders a progressive gallery with captions, thumbnails, and dialog controls', () => {
      const gallery = read('src/components/ProjectScreenshots.astro');
      const layout = read('src/layouts/ProjectLayout.astro');

      expect(gallery).toContain('data-project-screenshots');
      expect(gallery).toContain('data-screenshot-stage');
      expect(gallery).toContain('--screenshot-ratio:');
      expect(gallery).toContain("data-viewport={firstScreenshot.viewport}");
      expect(gallery).toContain('aria-current');
      expect(gallery).toContain('<dialog');
      expect(gallery).toContain('aria-label={copy.prevAriaLabel}');
      expect(gallery).toContain('aria-label={copy.nextAriaLabel}');
      expect(gallery).toContain('aria-label={copy.closeAriaLabel}');
      expect(gallery).toContain('<noscript>');
      expect(gallery).toContain('min-height: 44px;');
      expect(gallery).toContain('@media (prefers-reduced-motion: reduce)');
      expect(layout).toContain('<ProjectScreenshots');
      expect(layout.indexOf('<ProjectScreenshots')).toBeLessThan(layout.indexOf('project-panorama'));
    });
  });

  describe('2. 页面要怎么走：说明先于视觉舞台', () => {
    it('keeps the current screenshot explanation in the left column before the visual stage', () => {
      const gallery = read('src/components/ProjectScreenshots.astro');
      const stageIndex = gallery.indexOf('data-screenshot-stage');

      expect(stageIndex).toBeGreaterThan(-1);
      for (const hook of [
        'data-screenshot-progress',
        'data-screenshot-title',
        'data-screenshot-caption',
        'data-open-screenshot-dialog',
      ]) {
        expect(gallery.indexOf(hook), `${hook} should render before the screenshot stage`).toBeLessThan(stageIndex);
      }
    });
  });

  describe('4. 界面为什么这样排版：桌面等比与移动外框', () => {
    it('keeps desktop stages proportional while framing mobile captures as devices', () => {
      const gallery = read('src/components/ProjectScreenshots.astro');

      expect(gallery).toContain("stage.style.setProperty('--screenshot-ratio'");
      expect(gallery).toContain(".project-screenshots__stage[data-viewport='mobile'] .project-screenshots__media::before");
      expect(gallery).toContain(".project-screenshots__stage[data-viewport='mobile'] .project-screenshots__media::after");
      expect(gallery).toContain('grid-template-columns: repeat(auto-fit, minmax(108px, 1fr));');
    });

    it('names thumbnails by their real action instead of implying they open the lightbox', () => {
      const gallery = read('src/components/ProjectScreenshots.astro');
      const copy = read('src/data/projects.json');

      // 缩略图点击只切换舞台图，打开大图是单独的按钮；可访问名不能两处都说「查看」
      expect(gallery).toContain('copy.thumbnailAriaTemplate.replace(\'{title}\', screenshot.title)');
      expect(copy).toContain('"thumbnailAriaTemplate": "切换到截图：{title}"');
      expect(copy).toContain('"open": "查看大图"');
    });
  });

  describe('5. 最后代码怎么落地：按项目 id 派生标题 id', () => {
    it('uses a caller-provided stable heading id derived from the project id', () => {
      const gallery = read('src/components/ProjectScreenshots.astro');
      const layout = read('src/layouts/ProjectLayout.astro');

      expect(gallery).toContain('headingId: string;');
      expect(gallery).toContain('aria-labelledby={headingId}');
      expect(gallery).toContain('<h2 id={headingId}>');
      expect(gallery).not.toContain('id="project-screenshots-title"');

      expect(layout).toContain("project.id.replace(/\\.[^/.]+$/, '')");
      expect(layout).toContain("replace(/[^a-zA-Z0-9_-]+/g, '-')");
      expect(layout).toContain('headingId={projectScreenshotHeadingId}');
    });
  });
});
