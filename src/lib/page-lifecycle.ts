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
// 页面代际：首屏 DOMContentLoaded 与 Astro 在 window.load 派发的 astro:page-load
// 都会到达这里，同一个 init 在一代内只允许执行一次；每次 swap 前递增代际。
let generation = 0;

function runCleanups() {
  cleanups.forEach((cleanup) => {
    try { cleanup(); } catch { /* 单个清理失败不阻断其它清理 */ }
  });
  cleanups.clear();
  generation += 1;
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

  // Astro 在首屏 window.load 也会触发 astro:page-load；未启用 View Transitions 时用 DOMContentLoaded 兜底。
  // 两条路径可能都到达，用代际号去重，而不是用「是否跑过」的一次性标记。
  let lastGeneration = -1;
  const run = () => {
    if (lastGeneration === generation) return;
    lastGeneration = generation;
    const result = init();
    if (result instanceof Promise) {
      result.then((cleanup) => {
        if (typeof cleanup !== 'function') return;
        // 异步初始化期间发生了页面切换：清理函数属于旧页面，立即执行而不是留给下一代
        if (lastGeneration === generation) cleanups.add(cleanup);
        else cleanup();
      }).catch(() => { /* 异步初始化失败不影响其它模块 */ });
    } else if (typeof result === 'function') {
      cleanups.add(result);
    }
  };
  document.addEventListener('astro:page-load', run);
  const boot = () => {
    run();
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
}
