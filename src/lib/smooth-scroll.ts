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
  // 最近一次插值写入时间：仅在插值停止后忽略浏览器回抛的自身 scroll 事件
  let lastWriteAt = 0;

  const getMax = () => Math.max(document.documentElement.scrollHeight - window.innerHeight, 0);

  const loop = () => {
    const distance = target - current;
    // 距离越远追得越快，近距离保留柔和收尾；避免长钉屏章节要滚很久才到位
    const factor = Math.min(0.42, 0.2 + Math.abs(distance) / 1600);
    current += distance * factor;
    if (Math.abs(target - current) < 0.5) current = target;
    // 必须覆盖 CSS 的 scroll-behavior: smooth，否则每帧写入又被平滑动画接管，
    // onScrollSync 会把自己的滚动误判成外部滚动并 halt()，表现为「滚轮推不动」。
    window.scrollTo({ top: current, left: 0, behavior: 'instant' });
    lastWriteAt = performance.now();
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
    lastWriteAt = 0;
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
    // 本站首页画廊与项目截图是 5 屏钉屏舞台，按 1px/1px 滚完需要过多滚轮次数；
    // 仅在启用的舞台内放大输入，普通正文/列表保持原速。
    const activeStage = event.target instanceof Element
      ? event.target.closest('[data-scroll-gallery][data-active="1"], [data-screenshot-scroll-stage][data-active="1"]')
      : null;
    if (activeStage) delta *= 1.3;
    const next = Math.min(Math.max(target + delta, 0), getMax());
    // 已到页面顶部/底部时不再拦截，交还浏览器保留原生回弹与滚动链
    if (next === target) return;
    event.preventDefault();
    target = next;
    kick();
  };

  const onScrollSync = () => {
    const diff = window.scrollY - current;
    if (running) {
      // 逐帧 instant 写入后 window.scrollY 与 current 同步，diff≈0；
      // 不能再让 80ms 写入窗门控外部滚动，否则键盘翻页/拖滚动条会被惯性吸回。
      if (Math.abs(diff) > 10) halt();
      return;
    }
    // 停止插值后，浏览器回抛的自身 scroll 事件仍落在写入窗内，避免误同步基准
    if (performance.now() - lastWriteAt < 80) return;
    if (Math.abs(diff) > 2) current = target = window.scrollY;
  };

  // 同页锚点跳转前终止惯性，否则 loop 每帧回写会中止浏览器原生平滑滚动；
  // 跨页链接与外部链接带 # 时无需打断当前滚动手感。
  const onAnchorClick = (event: MouseEvent) => {
    const anchor = (event.target as Element | null)?.closest?.('a[href]');
    if (!(anchor instanceof HTMLAnchorElement)) return;
    if (!anchor.hash || anchor.origin !== location.origin) return;
    if (anchor.pathname !== location.pathname || anchor.search !== location.search) return;
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
    lastWriteAt = 0;
  };

  return { start, stop, halt };
}

export const smoothScroll = createSmoothScroll();
