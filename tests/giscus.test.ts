import { existsSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// 五段式测试框架（本文件只有一个契约用例，五段在同一用例内依次覆盖）：
// 1. 用户要完成什么：评论区能加载，且使用已验证的公开仓库配置。
// 2. 页面要怎么走：resolveGiscusConfig 读环境变量 → 缺项回落默认 → 缺一不可则抛错。
// 3. 空和失败怎么处理：配置不全显式抛错，未知/缺失主题回落 light。
// 4. 界面为什么这样排版：light/dark 双主题映射，跟随站点主题切换。
// 5. 最后代码怎么落地：giscus.ts 存在且可动态 import，断言不依赖静态导入。

describe('giscus configuration', () => {
  it('restores the validated public repository config and light/dark theme mapping', async () => {
    expect(existsSync('src/lib/giscus.ts')).toBe(true);

    const {
      defaultGiscusConfig,
      readGiscusConfig,
      resolveGiscusConfig,
      resolveGiscusTheme,
    } = await import('../src/lib/giscus');

    expect(defaultGiscusConfig).toEqual({
      repo: 'vo520/field-notes',
      repoId: 'R_kgDOV69v5A',
      category: 'General',
      categoryId: 'DIC_kwDOV69v5M4DL6XY',
    });
    expect(readGiscusConfig({ PUBLIC_GISCUS_REPO: 'owner/repo' })).toBeNull();
    expect(readGiscusConfig({
      PUBLIC_GISCUS_REPO: 'owner/repo',
      PUBLIC_GISCUS_REPO_ID: 'R_1',
      PUBLIC_GISCUS_CATEGORY: 'Comments',
      PUBLIC_GISCUS_CATEGORY_ID: 'DIC_1',
    })).toEqual({
      repo: 'owner/repo',
      repoId: 'R_1',
      category: 'Comments',
      categoryId: 'DIC_1',
    });
    expect(resolveGiscusConfig({})).toEqual(defaultGiscusConfig);
    expect(() => resolveGiscusConfig({
      PUBLIC_GISCUS_REPO: 'staging/repo',
    })).toThrow('Giscus 环境变量必须四项同时配置且格式正确');
    expect(resolveGiscusTheme('dark')).toBe('dark');
    expect(resolveGiscusTheme('light')).toBe('light');
    expect(resolveGiscusTheme('unknown')).toBe('light');
    expect(resolveGiscusTheme(undefined)).toBe('light');
  });
});
