/*
 * 离线缓存策略（保守）：
 * - 导航请求：网络优先，成功则写入缓存；离线时回退到已缓存页面或 /offline.html。
 * - 静态资源（/_astro/*、/images/*、/og/*）：缓存优先，命中即返回，减少回源。
 * - 动态资源（/pagefind/*、/admin/*、评论、RSS）：完全交给网络，不缓存。
 * 安装时不预缓存整站（页面数量会随内容增长），只缓存离线壳，避免缓存膨胀与版本错位。
 */
const CACHE = 'field-notes-v1';
// 离线壳复用构建产物：不新增 HTML 文件，避免影响静态页计数与 OG 断言
const SHELL = ['/', '/404.html', '/favicon.svg'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => undefined).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(pruneCache)
      .then(() => self.clients.claim()),
  );
});

// 缓存条目上限：/_astro/* 文件名带内容 hash，新版本部署后旧条目永远不会再被命中，
// 不裁剪会无界膨胀。cache.keys() 按写入顺序返回，从头部淘汰即可（Lru 近似）。
// 离线壳（SHELL）不参与淘汰，保证离线兜底始终可用。
const MAX_ENTRIES = 180;
async function pruneCache() {
  const cache = await caches.open(CACHE);
  const keys = await cache.keys();
  if (keys.length <= MAX_ENTRIES) return;
  const stale = keys
    .slice(0, keys.length - MAX_ENTRIES)
    .filter((key) => !SHELL.includes(new URL(key.url).pathname));
  await Promise.all(stale.map((key) => cache.delete(key)));
}

const isStatic = (pathname) =>
  pathname.startsWith('/_astro/') || pathname.startsWith('/images/') || pathname.startsWith('/og/');
// 全站清单随内容发布变化，交给网络优先拿最新；这里直接交给浏览器，不进 SW 缓存
const isDynamic = (pathname) =>
  pathname.startsWith('/pagefind/')
  || pathname.startsWith('/admin/')
  || pathname === '/rss.xml'
  || pathname === '/site-index.json';

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isDynamic(url.pathname)) return;

  if (isStatic(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response.ok) {
            const copy = response.clone();
            // 写入新条目后顺手裁剪，把缓存体积始终压在上限内
            caches.open(CACHE).then((cache) => cache.put(request, copy)).then(pruneCache).catch(() => undefined);
          }
          return response;
        }).catch(() => {
          // 走到这里说明缓存里没有且网络也不通：
          // 之前返回 cached 会得到 undefined（cached 必然为空），
          // event.respondWith(undefined) 会抛 TypeError，这里必须给一个合法 Response
          return Response.error();
        });
      }),
    );
    return;
  }

  // 导航与其它同源文档：网络优先，离线回退缓存
  // 导航缓存键去掉 query：/projects/?category=x 与 /projects/ 返回同一份 HTML，
  // 分开缓存既浪费配额，离线时还会因为精确匹配不到而退化成 404 页
  const cacheKey = request.mode === 'navigate'
    ? new Request(url.origin + url.pathname, { headers: request.headers })
    : request;

  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok && request.mode === 'navigate') {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(cacheKey, copy)).then(pruneCache).catch(() => undefined);
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(cacheKey);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const offline = await caches.match('/404.html');
        if (offline) return offline;
      }
      return Response.error();
    }),
  );
});
