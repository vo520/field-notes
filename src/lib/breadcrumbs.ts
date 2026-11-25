import { siteConfig } from '../config/site';

export interface Breadcrumb {
  label: string;
  href: string;
}

export function makeArticleBreadcrumbs(id: string, title: string): Breadcrumb[] {
  return [
    { label: siteConfig.crumbs.home, href: '/' },
    { label: siteConfig.crumbs.articles, href: '/articles/' },
    { label: title, href: `/articles/${id}/` },
  ];
}

export function makeProjectBreadcrumbs(id: string, title: string): Breadcrumb[] {
  return [
    { label: siteConfig.crumbs.home, href: '/' },
    { label: siteConfig.crumbs.projects, href: '/projects/' },
    { label: title, href: `/projects/${id}/` },
  ];
}
