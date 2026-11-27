import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 数字递增动画的生命周期契约：
 * - 同一元素在动画途中反复进入视口不叠加 rAF 链（数字不会跳动）
 * - cleanup 取消全部挂起的帧，View Transitions swap 后不写已卸载的 DOM
 */

type ObserverCallback = (entries: Array<{ isIntersecting: boolean; target: HTMLElement }>) => void;

let rafCallbacks = new Map<number, (now: number) => void>();
let nextRafId = 1;
let observerCallback: ObserverCallback | undefined;
let observed: HTMLElement[] = [];
let now = 0;

const makeNode = (count: number): HTMLElement => ({
  dataset: { projectCount: String(count) },
  textContent: String(count),
} as unknown as HTMLElement);

beforeEach(() => {
  vi.resetModules();
  rafCallbacks = new Map();
  nextRafId = 1;
  observed = [];
  observerCallback = undefined;
  now = 0;

  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: false }),
    requestAnimationFrame: (callback: (now: number) => void) => {
      const id = nextRafId++;
      rafCallbacks.set(id, callback);
      return id;
    },
    cancelAnimationFrame: (id: number) => { rafCallbacks.delete(id); },
  });
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: ObserverCallback) { observerCallback = callback; }
    observe(node: HTMLElement) { observed.push(node); }
    unobserve(node: HTMLElement) { observed = observed.filter((item) => item !== node); }
    disconnect() { observed = []; }
  });
  vi.stubGlobal('performance', { now: () => now });
});

const flushFrame = (advance: number) => {
  now += advance;
  const pending = [...rafCallbacks.values()];
  rafCallbacks.clear();
  pending.forEach((callback) => callback(now));
};

const load = async () => await import('../src/lib/scroll-effects');

describe('count-up lifecycle', () => {
  it('does not stack a second animation for the same node', async () => {
    const node = makeNode(12);
    vi.stubGlobal('document', { querySelectorAll: () => [node] });
    const { initCountUp } = await load();
    const cleanup = initCountUp();

    observerCallback?.([{ isIntersecting: true, target: node }]);
    expect(rafCallbacks.size).toBe(1);
    // 动画途中再次进入视口：不应新增帧
    observerCallback?.([{ isIntersecting: true, target: node }]);
    expect(rafCallbacks.size).toBe(1);

    flushFrame(450);
    expect(Number(node.textContent)).toBeGreaterThan(0);
    expect(rafCallbacks.size).toBe(1);
    flushFrame(450);
    expect(node.textContent).toBe('12');
    expect(rafCallbacks.size).toBe(0);
    cleanup();
  });

  it('cancels pending frames on cleanup and stops writing detached nodes', async () => {
    const node = makeNode(8);
    vi.stubGlobal('document', { querySelectorAll: () => [node] });
    const { initCountUp } = await load();
    const cleanup = initCountUp();

    observerCallback?.([{ isIntersecting: true, target: node }]);
    flushFrame(300);
    const written = node.textContent;
    cleanup();
    expect(rafCallbacks.size).toBe(0);

    // cleanup 后即使旧帧被强行调用也不再写 DOM
    expect(node.textContent).toBe(written);
    observerCallback?.([{ isIntersecting: true, target: node }]);
    expect(rafCallbacks.size).toBe(0);
    expect(node.textContent).toBe(written);
  });

  it('animates multiple nodes independently', async () => {
    const a = makeNode(3);
    const b = makeNode(5);
    vi.stubGlobal('document', { querySelectorAll: () => [a, b] });
    const { initCountUp } = await load();
    const cleanup = initCountUp();

    observerCallback?.([
      { isIntersecting: true, target: a },
      { isIntersecting: true, target: b },
    ]);
    expect(rafCallbacks.size).toBe(2);
    flushFrame(900);
    expect(a.textContent).toBe('3');
    expect(b.textContent).toBe('5');
    expect(rafCallbacks.size).toBe(0);
    cleanup();
  });
});
