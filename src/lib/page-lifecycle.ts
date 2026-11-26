/**
 * View Transitions 生命周期内核。
 * Astro 的模块脚本在页面 swap 后不会重跑，DOM 绑定的监听器会失效；
 * 这里把初始化统一挂到 astro:page-load（首屏与每次导航后都会触发），
 * 并在 astro:before-swap 前执行清理函数，避免全局监听器叠加。
 *
 * 模块脚本本身只加载一次（Astro 按内容 hash 去重），所以 registerPageInit
 * 在顶层调用即可，重复调用同一 init 会被去重。
 */
export type PageCleanup = () => void;
export type PageInit = () => PageCleanup | void | Promise<PageCleanup | void>;

const registered = new Set<PageInit>();
const cleanups = new Set<PageCleanup>();

function runCleanups() {
  cleanups.forEach((cleanup) => {
    try { cleanup(); } catch { /* 单个清理失败不阻断其它清理 */ }
  });
  cleanups.clear();
}

function attach() {
  const host = window as Window & { __pageLifecycleAttached?: boolean };
  if (host.__pageLifecycleAttached) return;
  host.__pageLifecycleAttached = true;
  document.addEventListener('astro:before-swap', runCleanups);
}

/** 注册一个页面初始化函数：每次页面加载后执行，返回的函数会在下次 swap 前清理。 */
export function registerPageInit(init: PageInit): void {
  if (registered.has(init)) return;
  registered.add(init);
  attach();

  // Astro 在首屏加载完成后也会触发 astro:page-load；未启用 View Transitions 时手动跑一次。
  let ranOnce = false;
  const run = () => {
    ranOnce = true;
    const result = init();
    if (result instanceof Promise) {
      result.then((cleanup) => { if (typeof cleanup === 'function') cleanups.add(cleanup); })
        .catch(() => { /* 异步初始化失败不影响其它模块 */ });
    } else if (typeof result === 'function') {
      cleanups.add(result);
    }
  };
  document.addEventListener('astro:page-load', run);
  const boot = () => {
    if (ranOnce) return;
    run();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
