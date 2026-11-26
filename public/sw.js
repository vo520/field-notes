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
      .then(() => self.clients.claim()),
  );
});

const isStatic = (pathname) =>
  pathname.startsWith('/_astro/') || pathname.startsWith('/images/') || pathname.startsWith('/og/');
const isDynamic = (pathname) =>
  pathname.startsWith('/pagefind/') || pathname.startsWith('/admin/') || pathname === '/rss.xml';

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isDynamic(url.pathname)) return;

  if (isStatic(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => cached || fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
        }
        return response;
      }).catch(() => cached)),
    );
    return;
  }

  // 导航与其它同源文档：网络优先，离线回退缓存
  event.respondWith(
    fetch(request).then((response) => {
      if (response.ok && request.mode === 'navigate') {
        const copy = response.clone();
        caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => undefined);
      }
      return response;
    }).catch(async () => {
      const cached = await caches.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const offline = await caches.match('/404.html');
        if (offline) return offline;
      }
      return Response.error();
    }),
  );
});
