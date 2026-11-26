/**
 * 粘性舞台的统一进度内核（对应参考项目的 useStageProgress）。
 * 外层高容器 + 内层 sticky 视口：进度 = -stage.top / (stage.height - viewport.height)，
 * 与 GSAP ScrollTrigger 的 start "top top" → end "bottom bottom" scrub 语义一致。
 * 所有消费者共享同一套 rAF 节流、边界裁剪和卸载清理，避免各页面重复实现导致进度不一致。
 */

export function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** GSAP power1.out 等价，用于镜头入场/退场的时间线缓动。 */
export function easeOutQuad(progress: number): number {
  const p = clamp01(progress);
  return 1 - (1 - p) ** 2;
}

/** 线性区间映射：把全局进度映射到 [start, end] 内的 0~1。 */
export function rangeProgress(progress: number, start: number, end: number): number {
  if (end === start) return progress >= end ? 1 : 0;
  return clamp01((progress - start) / (end - start));
}

/** sticky 镜头序列仅在桌面精确指针且未开启减动效时启用。 */
export function canUseStickyMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(pointer: fine)').matches
    && !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export type StageProgressHandler = (progress: number) => void;

/**
 * 监听舞台滚动进度，返回解绑函数。首屏立即计算一次，刷新时不在页顶也能正确恢复。
 * 舞台不可滚动（移动端降级 height:auto）时回调恒为 0。
 */
export function observeStageProgress(stage: HTMLElement | null, onUpdate: StageProgressHandler): () => void {
  if (!stage) return () => {};

  let ticking = false;
  let rafId = 0;
  let active = true;

  const update = () => {
    ticking = false;
    if (!active) return;
    const travel = stage.offsetHeight - window.innerHeight;
    const progress = travel > 0
      ? clamp01(-stage.getBoundingClientRect().top / travel)
      : 0;
    onUpdate(progress);
  };

  const schedule = () => {
    if (!active || ticking) return;
    ticking = true;
    rafId = window.requestAnimationFrame(update);
  };

  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule);
  update();

  return () => {
    active = false;
    window.removeEventListener('scroll', schedule);
    window.removeEventListener('resize', schedule);
    if (rafId) window.cancelAnimationFrame(rafId);
    rafId = 0;
    ticking = false;
  };
}
