/**
 * 前台路由与后台校验共用的 slug 归一规则。
 * 保持无依赖：既能打进 Astro 构建，也能打进浏览器端的后台 preSave 脚本。
 * 修改本文件即同时改变标签页、分类页、文章关联项目与分类保存校验的口径。
 */
export function toTagSlug(tag: string): string {
  const slug = tag
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\\/?#%&+]+/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

  // 纯标点 tag 归一化后为空，回落到固定 slug，避免生成 /tags// 这类无效路径
  return slug || 'tag';
}
