export interface Breadcrumb {
  label: string;
  href: string;
}

export function makeArticleBreadcrumbs(id: string, title: string): Breadcrumb[] {
  return [
    { label: '首页', href: '/' },
    { label: '文章', href: '/articles/' },
    { label: title, href: `/articles/${id}/` },
  ];
}

export function makeProjectBreadcrumbs(id: string, title: string): Breadcrumb[] {
  return [
    { label: '首页', href: '/' },
    { label: '项目', href: '/projects/' },
    { label: title, href: `/projects/${id}/` },
  ];
}

export function makeTagBreadcrumbs(tag: string, label: string, hasChildren = true): Breadcrumb[] {
  const parent: Breadcrumb[] = [
    { label: '首页', href: '/' },
    { label: '标签', href: '/tags/' },
  ];
  if (hasChildren) {
    parent.push({ label, href: `/tags/${encodeURIComponent(tag)}/` });
  }
  return parent;
}
