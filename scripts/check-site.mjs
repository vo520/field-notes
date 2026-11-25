#!/usr/bin/env node
// 线上巡检：按 sitemap 抓取所有页面，检查状态码与关键结构。
// 不启动浏览器，纯 HTTP 请求。

const base = (process.env.SITE_URL ?? 'https://blog.ytn520.top').replace(/\/$/, '');
const MAX_PAGES = Number(process.env.SITE_CHECK_MAX_PAGES ?? 200);
const CONCURRENCY = Number(process.env.SITE_CHECK_CONCURRENCY ?? 4);
const REQUEST_TIMEOUT_MS = Number(process.env.SITE_CHECK_TIMEOUT_MS ?? 15_000);
const failures = [];

async function fetchText(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    headers: { 'user-agent': 'field-notes-site-check' },
  });
  return { response, text: await response.text() };
}

function matches(text, pattern) {
  const regex = pattern instanceof RegExp
    ? (pattern.global ? pattern : new RegExp(pattern.source, pattern.flags + 'g'))
    : new RegExp(pattern, 'g');
  return [...text.matchAll(regex)].map((match) => match[1]);
}

async function collectPages() {
  const indexUrl = `${base}/sitemap-index.xml`;
  const { response, text } = await fetchText(indexUrl);

  if (!response.ok) {
    throw new Error(`${indexUrl} 返回 ${response.status}`);
  }

  const sitemaps = matches(text, /<loc>([^<]+)<\/loc>/g);

  // 并发抓取子 sitemap，失败的记进 failures
  const results = await Promise.all(sitemaps.map(async (url) => {
    const child = await fetchText(url);
    if (!child.response.ok) {
      failures.push(`${url} 返回 ${child.response.status}`);
      return [];
    }
    return matches(child.text, /<loc>([^<]+)<\/loc>/g);
  }));

  const pages = new Set();
  for (const url of results.flat()) {
    try {
      pages.add(decodeURIComponent(url));
    } catch {
      pages.add(url);
    }
  }

  return [...pages];
}

async function checkPage(url) {
  const { response, text } = await fetchText(url);
  if (response.status !== 200) {
    failures.push(`${url} 返回 ${response.status}`);
    return;
  }

  if (!/text\/html/.test(response.headers.get('content-type') ?? '')) {
    failures.push(`${url} content-type 不是 text/html`);
  }

  const h1Count = matches(text, /<h1\b/g).length;
  if (h1Count !== 1) {
    failures.push(`${url} 的 h1 数量为 ${h1Count}`);
  }

  for (const [label, pattern] of [
    ['title', /<title>[^<]+<\/title>/],
    ['description', /<meta name="description" content="[^"]+"/],
    ['canonical', /<link rel="canonical" href="[^"]+"/],
  ]) {
    if (!pattern.test(text)) failures.push(`${url} 缺少 ${label}`);
  }
}

async function checkRss() {
  const { response, text } = await fetchText(`${base}/rss.xml`);
  if (!response.ok) {
    failures.push(`/rss.xml 返回 ${response.status}`);
    return;
  }
  if (matches(text, /<item>/g).length === 0) {
    failures.push('/rss.xml 没有条目');
  }
}

async function checkRobots() {
  const { response, text } = await fetchText(`${base}/robots.txt`);
  if (!response.ok) {
    failures.push(`/robots.txt 返回 ${response.status}`);
    return;
  }
  if (!/Sitemap:\s*https?:\/\//i.test(text)) {
    failures.push('/robots.txt 缺少 Sitemap 地址');
  }
}

async function main() {
  const pages = await collectPages();
  if (pages.length === 0) throw new Error('sitemap 中没有页面');
  if (pages.length > MAX_PAGES) throw new Error(`页面数 ${pages.length} 超过上限 ${MAX_PAGES}`);

  const queue = [...pages];
  async function worker() {
    while (queue.length > 0) {
      await checkPage(queue.shift());
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, pages.length) }, worker));

  await Promise.all([checkRss(), checkRobots()]);

  console.log(`检查了 ${pages.length} 个页面，失败 ${failures.length} 项`);
  if (failures.length > 0) {
    failures.forEach((failure) => console.error(`- ${failure}`));
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
