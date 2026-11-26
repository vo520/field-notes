/**
 * 滚动驱动的轻量交互集合：Hero 视差、数字 count-up、区块进入视口淡入。
 * 纯前端零依赖；无 JS 时不隐藏内容，reduced-motion 时全部降级为静态。
 */

const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Hero 文案随滚动做有限位移，营造视差；只改 transform，不影响布局与 pagefind 索引。 */
export function initHeroParallax(): () => void {
  if (prefersReducedMotion()) return () => {};
  const copy = document.querySelector<HTMLElement>('.hero-studio__copy');
  if (!copy) return () => {};

  let ticking = false;
  const update = () => {
    ticking = false;
    const y = Math.min(window.scrollY, window.innerHeight * 1.2);
    copy.style.transform = `translateY(${(y * 0.12).toFixed(1)}px)`;
  };
  const onScroll = () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(update);
  };
  window.addEventListener('scroll', onScroll, { passive: true });
  update();
  // View Transitions 下每次导航都会重新初始化，必须解绑滚动监听，否则会随导航次数累积
  return () => window.removeEventListener('scroll', onScroll);
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

  const observer = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target as HTMLElement;
        const target = Number.parseInt(el.dataset.projectCount ?? '', 10);
        if (!Number.isFinite(target)) {
          observer.unobserve(el);
          continue;
        }
        const duration = 900;
        const start = performance.now();
        const tick = (now: number) => {
          const progress = Math.min(1, (now - start) / duration);
          const eased = 1 - Math.pow(1 - progress, 3);
          el.textContent = String(Math.round(target * eased));
          if (progress < 1) window.requestAnimationFrame(tick);
          else observer.unobserve(el);
        };
        window.requestAnimationFrame(tick);
      }
    },
    { threshold: 0.4 },
  );
  nodes.forEach((node) => observer.observe(node));
  return () => observer.disconnect();
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
