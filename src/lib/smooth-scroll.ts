/**
 * 惯性平滑滚轮：把 wheel 输入累积为虚拟目标位置，用 rAF 逐帧插值写回 window.scrollTo。
 * 保留原生滚动条、键盘翻页与锚点跳转；仅在桌面精确指针下启用。
 * 与站点现有的 rAF 节流监听（阅读进度、返回顶部、Header）互不干扰。
 */

export interface SmoothScrollController {
  start: () => void;
  stop: () => void;
  halt: () => void;
}

export function createSmoothScroll(): SmoothScrollController {
  let target = 0;
  let current = 0;
  let rafId = 0;
  let running = false;

  const getMax = () => Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);

  const loop = () => {
    current += (target - current) * 0.12;
    if (Math.abs(target - current) < 0.5) current = target;
    window.scrollTo(0, current);
    if (current === target) {
      running = false;
      rafId = 0;
      return;
    }
    rafId = requestAnimationFrame(loop);
  };

  const kick = () => {
    if (!running) {
      running = true;
      rafId = requestAnimationFrame(loop);
    }
  };

  /** 立即终止惯性插值但保留监听器：锚点跳转等程序化滚动前必须调用。 */
  const halt = () => {
    if (rafId) cancelAnimationFrame(rafId);
    running = false;
    rafId = 0;
    current = target = window.scrollY;
  };

  // 滚轮事件源自可纵向滚动的内部容器（下拉、筛选栏等）时交还原生滚动
  const fromScrollable = (targetNode: EventTarget | null) => {
    let node = targetNode instanceof Element ? targetNode : null;
    while (node && node !== document.body) {
      const overflowY = getComputedStyle(node).overflowY;
      if (/(auto|scroll|overlay)/.test(overflowY) && node.scrollHeight > node.clientHeight + 2) return true;
      node = node.parentElement;
    }
    return false;
  };

  const onWheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.deltaY === 0) return;
    // 弹层锁定页面滚动时交还浏览器，避免滚回页顶
    if (document.body.style.overflow === 'hidden' || document.querySelector('dialog[open]')) return;
    if (fromScrollable(event.target)) return;
    // 外部滚动（键盘、滚动条拖动、锚点）后先同步基准
    if (Math.abs(window.scrollY - current) > 2) current = target = window.scrollY;
    let delta = event.deltaY;
    if (event.deltaMode === 1) delta *= 16;
    else if (event.deltaMode === 2) delta *= window.innerHeight;
    const next = Math.min(Math.max(target + delta, 0), getMax());
    // 已到页面顶部/底部时不再拦截，交还浏览器保留原生回弹与滚动链
    if (next === target) return;
    event.preventDefault();
    target = next;
    kick();
  };

  const onScrollSync = () => {
    const diff = window.scrollY - current;
    // 惯性运行中若被外部滚动（锚点 scrollIntoView、滚动条拖动）改变，取消插值交还控制权
    if (running && Math.abs(diff) > 10) {
      halt();
      return;
    }
    if (!running && Math.abs(diff) > 2) current = target = window.scrollY;
  };

  // 锚点跳转前终止惯性，否则 loop 每帧回写会中止浏览器原生平滑滚动
  const onAnchorClick = (event: MouseEvent) => {
    const anchor = (event.target as Element | null)?.closest?.('a[href*="#"]');
    if (!anchor) return;
    halt();
  };

  const start = () => {
    stop(); // 幂等：避免重复挂载时监听器叠加导致滚轮加速
    if (!window.matchMedia('(pointer: fine)').matches) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    current = target = window.scrollY;
    window.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('scroll', onScrollSync, { passive: true });
    document.addEventListener('click', onAnchorClick, true);
  };

  const stop = () => {
    window.removeEventListener('wheel', onWheel);
    window.removeEventListener('scroll', onScrollSync);
    document.removeEventListener('click', onAnchorClick, true);
    if (rafId) cancelAnimationFrame(rafId);
    running = false;
    rafId = 0;
  };

  return { start, stop, halt };
}

export const smoothScroll = createSmoothScroll();
