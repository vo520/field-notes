export const siteConfig = {
  name: 'Nice 个人博客',
  brand: 'NICE / FULL-STACK ENGINEER',
  brandMark: 'N',
  title: 'Nice 个人博客｜全栈工程师',
  description: 'Nice，全栈工程师，长期交付企业官网、管理系统、电商与小程序项目，关注 PHP、Vue、Nuxt 与 Next.js 的工程化落地。',
  author: {
    name: 'Nice',
    role: '全栈工程师',
    bio: '我是 Nice，一名全栈工程师，能从需求梳理、前端实现、后端接口一路做到部署上线；项目源码同步在 Gitee 与 GitHub。',
  },
  social: {
    github: 'https://github.com/vo520',
    gitee: 'https://gitee.com/vo520',
    email: '',
  },
  nav: [
    { href: '/', label: '首页' },
    { href: '/projects/', label: '项目' },
    { href: '/articles/', label: '文章' },
    { href: '/guestbook/', label: '留言' },
    { href: '/about/', label: '关于' },
  ],
} as const;

export type SiteConfig = typeof siteConfig;

