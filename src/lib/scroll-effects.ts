/**
 * 滚动驱动的轻量交互集合：Hero 视差、数字 count-up、区块进入视口淡入。
 * 纯前端零依赖；无 JS 时不隐藏内容，reduced-motion 时全部降级为静态。
 */
import { onScrollFrame } from './scroll-ticker';

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Hero 文案随滚动做有限位移，营造视差；只改 transform，不影响布局与 pagefind 索引。 */
export function initHeroParallax(): () => void {
  if (prefersReducedMotion()) return () => {};
  // 触屏滚动由合成器驱动，跟随 scroll 事件改 transform 反而掉帧，移动端直接保持静态
  if (!window.matchMedia('(pointer: fine)').matches) return () => {};
  const copy = document.querySelector<HTMLElement>('.hero-studio__copy');
  if (!copy) return () => {};

  // 读阶段取滚动位置，写阶段才改 transform；走全站共享调度器避免重复布局
  let offset = 0;
  return onScrollFrame({
    read: () => {
      const y = Math.min(window.scrollY, window.innerHeight * 1.2);
      offset = y * 0.12;
    },
    write: () => {
      copy.style.transform = `translateY(${offset.toFixed(1)}px)`;
    },
  });
}

/** 数字递增：只对标记元素生效，SSR 仍输出真实值，脚本进入视口时才从 0 递增。 */
export function initCountUp(): () => void {
  if (prefersReducedMotion()) return () => {};
  const nodes = document.querySelectorAll<HTMLElement>('[data-project-count]');
  if (nodes.length === 0 || typeof IntersectionObserver === 'undefined') return () => {};

  // 先归零再观察，避免首屏元素从真实值瞬间跳回 0 的闪烁；data 属性保留真实值供测试与无障碍读取
  nodes.forEach((node) => {
    if (Number.isFinite(Number.parseInt(node.dataset.projectCount ?? '', 10))) node.textContent = '0';
  });

  // 同一元素可能在动画途中反复进出观察带；记录已启动的节点，避免叠加多条 rAF 链让数字跳动
  const rafIds = new Map<HTMLElement, number>();
  let disposed = false;

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting || disposed) continue;
        const el = entry.target as HTMLElement;
        if (rafIds.has(el)) continue;
        const target = Number.parseInt(el.dataset.projectCount ?? '', 10);
        if (!Number.isFinite(target)) {
          observer.unobserve(el);
          continue;
        }
        const duration = 900;
        const start = performance.now();
        const tick = (now: number) => {
          if (disposed) return;
          const progress = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = String(Math.round(target * eased));
          if (progress < 1) {
            rafIds.set(el, window.requestAnimationFrame(tick));
          } else {
            rafIds.delete(el);
            observer.unobserve(el);
          }
        };
        rafIds.set(el, window.requestAnimationFrame(tick));
      }
    },
    { threshold: 0.4 },
  );
  nodes.forEach((node) => observer.observe(node));
  return () => {
    disposed = true;
    observer.disconnect();
    // View Transitions swap 时立刻停帧，不再写已卸载的 DOM
    rafIds.forEach((id) => window.cancelAnimationFrame(id));
    rafIds.clear();
  };
}

/** 区块淡入：初始可见，脚本运行时才标记待入场，避免无 JS 时内容消失。 */
export function initReveal(): () => void {
  if (prefersReducedMotion()) return () => {};
  const nodes = document.querySelectorAll<HTMLElement>('[data-reveal]');
  if (nodes.length === 0) return () => {};
  if (typeof IntersectionObserver === 'undefined') return () => {};

  nodes.forEach((node) => node.classList.add('is-reveal-pending'));
  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.classList.add('is-reveal-in');
        observer.unobserve(entry.target);
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -6% 0px' },
  );
  nodes.forEach((node) => observer.observe(node));
  return () => observer.disconnect();
}

export function initScrollEffects(): () => void {
  const cleanups = [initHeroParallax(), initCountUp(), initReveal()];
  return () => cleanups.forEach((cleanup) => cleanup());
}
