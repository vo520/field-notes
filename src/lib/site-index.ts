/**
 * 全站清单的客户端加载器。
 *
 * 数据源是构建期生成的 /site-index.json（命令面板页面清单 + 文章/项目 + 随机漫游目标）。
 * 之前这些数据以 JSON 字符串内联在每个页面的 HTML 里，98 个页面各背约 9KB，
 * 移动端首屏白白多传一遍。现在改为按需拉取一次并缓存。
 */

export interface SiteIndexPage {
  label: string;
  href: string;
}

export interface SiteIndex {
  pages: SiteIndexPage[];
  articles: SiteIndexPage[];
  projects: SiteIndexPage[];
  randomTargets: string[];
}

const ENDPOINT = '/site-index.json';
const CACHE_KEY = 'site-index-cache';
// 缓存有效期 1 小时：内容发布后最多延迟 1 小时生效，与静态资源的 CDN 缓存同量级
const CACHE_TTL = 60 * 60 * 1000;
// 请求超时：弱网/挂起时不能让按钮或面板无限等待，超时后返回 null 交给调用方降级/重试
export const FETCH_TIMEOUT_MS = 6000;

let inflight: Promise<SiteIndex | null> | undefined;

const readCache = (): SiteIndex | null => {
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data?: SiteIndex; at?: number };
    if (!parsed.data || typeof parsed.at !== 'number') return null;
    if (Date.now() - parsed.at > CACHE_TTL) {
      sessionStorage.removeItem(CACHE_KEY);
      return null;
    }
    return parsed.data;
  } catch {
    return null;
  }
};

const writeCache = (data: SiteIndex) => {
  try {
    sessionStorage.setItem(CACHE_KEY, JSON.stringify({ data, at: Date.now() }));
  } catch {
    /* 存储不可用时退化为每次重新拉取 */
  }
};

const isSiteIndex = (value: unknown): value is SiteIndex => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<SiteIndex>;
  return Array.isArray(candidate.pages)
    && Array.isArray(candidate.articles)
    && Array.isArray(candidate.projects)
    && Array.isArray(candidate.randomTargets);
};

/**
 * 拉取全站清单。失败时返回 null，调用方自行降级（命令面板退化为只显示后台配的页面清单，
 * 随机漫游退化为空列表并隐藏按钮）。
 */
export async function loadSiteIndex(): Promise<SiteIndex | null> {
  const cached = readCache();
  if (cached) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(ENDPOINT, {
        headers: { Accept: 'application/json' },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const data: unknown = await response.json();
      if (!isSiteIndex(data)) return null;
      writeCache(data);
      return data;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
      inflight = undefined;
    }
  })();

  return inflight;
}
