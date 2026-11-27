import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 全站清单加载器的行为契约：
 * - 首次拉取后写入 sessionStorage，后续命中缓存不再请求网络
 * - 缓存超过 TTL 后重新拉取
 * - 并发调用合并为一次请求
 * - 请求失败返回 null，不抛错（调用方自行降级）
 */

const store = new Map<string, string>();

const mockSessionStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => {
    store.set(key, value);
  },
  removeItem: (key: string) => {
    store.delete(key);
  },
};

const sampleIndex = {
  pages: [{ label: '首页', href: '/' }],
  articles: [{ label: '示例文章', href: '/articles/demo/' }],
  projects: [{ label: '示例项目', href: '/projects/demo/' }],
  randomTargets: ['/articles/demo/', '/projects/demo/'],
};

beforeEach(() => {
  vi.resetModules();
  store.clear();
  vi.stubGlobal('sessionStorage', mockSessionStorage);
});

const loadIndexer = async () => await import('../src/lib/site-index');

describe('site index loader', () => {
  it('fetches once and reuses the session cache afterwards', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleIndex,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { loadSiteIndex } = await loadIndexer();
    const first = await loadSiteIndex();
    expect(first).toEqual(sampleIndex);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const second = await loadSiteIndex();
    expect(second).toEqual(sampleIndex);
    // 第二次命中缓存，不再发请求
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refetches after the cache expires', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleIndex,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { loadSiteIndex } = await loadIndexer();
    await loadSiteIndex();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // 把缓存时间戳推到 TTL 之外
    const cached = JSON.parse(store.get('site-index-cache') ?? '{}');
    store.set('site-index-cache', JSON.stringify({ ...cached, at: Date.now() - 2 * 60 * 60 * 1000 }));

    await loadSiteIndex();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('merges concurrent calls into a single request', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => sampleIndex,
    });
    vi.stubGlobal('fetch', fetchMock);

    const { loadSiteIndex } = await loadIndexer();
    const [a, b, c] = await Promise.all([
      loadSiteIndex(),
      loadSiteIndex(),
      loadSiteIndex(),
    ]);

    expect(a).toEqual(sampleIndex);
    expect(b).toEqual(sampleIndex);
    expect(c).toEqual(sampleIndex);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('returns null instead of throwing when the request fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

    const { loadSiteIndex } = await loadIndexer();
    await expect(loadSiteIndex()).resolves.toBeNull();
  });

  it('rejects a malformed payload without caching it', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ unexpected: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const { loadSiteIndex } = await loadIndexer();
    await expect(loadSiteIndex()).resolves.toBeNull();
    expect(store.get('site-index-cache')).toBeUndefined();
  });
});
