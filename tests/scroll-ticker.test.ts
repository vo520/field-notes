import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * 共享滚动帧调度器的行为契约：
 * - 一帧内先跑完所有读回调，再跑所有写回调（读写分离，避免 layout thrashing）
 * - 多次 scroll 事件在同一帧内只排一次 rAF
 * - 解绑最后一个订阅者后自动摘掉 window 上的监听，避免跨页面累积
 */

let rafCallbacks: Array<() => void> = [];
let scrollListeners = new Set<() => void>();
let resizeListeners = new Set<() => void>();
let nextRafId = 1;

beforeEach(() => {
  vi.resetModules();
  rafCallbacks = [];
  scrollListeners = new Set();
  resizeListeners = new Set();
  nextRafId = 1;

  vi.stubGlobal('requestAnimationFrame', (callback: () => void) => {
    rafCallbacks.push(callback);
    return nextRafId++;
  });
  vi.stubGlobal('cancelAnimationFrame', (id: number) => {
    rafCallbacks = rafCallbacks.filter((_, index) => index + 1 !== id);
  });
  vi.stubGlobal('window', {
    addEventListener: (name: string, listener: () => void) => {
      if (name === 'scroll') scrollListeners.add(listener);
      if (name === 'resize') resizeListeners.add(listener);
    },
    removeEventListener: (name: string, listener: () => void) => {
      if (name === 'scroll') scrollListeners.delete(listener);
      if (name === 'resize') resizeListeners.delete(listener);
    },
    requestAnimationFrame: (callback: () => void) => {
      rafCallbacks.push(callback);
      return nextRafId++;
    },
    cancelAnimationFrame: (id: number) => {
      rafCallbacks = rafCallbacks.filter((_, index) => index + 1 !== id);
    },
  });
});

const flushFrames = () => {
  const pending = rafCallbacks;
  rafCallbacks = [];
  pending.forEach((callback) => callback());
};

const loadTicker = async () => await import('../src/lib/scroll-ticker');

describe('shared scroll ticker', () => {
  it('runs every read callback before any write callback', async () => {
    const { onScrollFrame } = await loadTicker();
    const order: string[] = [];

    const stopA = onScrollFrame({
      read: () => order.push('read-a'),
      write: () => order.push('write-a'),
    });
    const stopB = onScrollFrame({
      read: () => order.push('read-b'),
      write: () => order.push('write-b'),
    });

    flushFrames();

    expect(order).toEqual(['read-a', 'read-b', 'write-a', 'write-b']);
    stopA();
    stopB();
  });

  it('coalesces multiple scroll events into a single frame', async () => {
    const { onScrollFrame } = await loadTicker();
    const read = vi.fn();
    const stop = onScrollFrame({ read });

    flushFrames();
    expect(read).toHaveBeenCalledTimes(1);

    // 连续三个 scroll 事件只应再排一帧
    scrollListeners.forEach((listener) => {
      listener();
      listener();
      listener();
    });
    expect(rafCallbacks).toHaveLength(1);

    flushFrames();
    expect(read).toHaveBeenCalledTimes(2);
    stop();
  });

  it('detaches window listeners once the last subscriber leaves', async () => {
    const { onScrollFrame } = await loadTicker();
    const stopA = onScrollFrame({ read: () => {} });
    const stopB = onScrollFrame({ read: () => {} });

    expect(scrollListeners.size).toBe(1);
    expect(resizeListeners.size).toBe(1);

    stopA();
    // 仍有订阅者时不能提前解绑
    expect(scrollListeners.size).toBe(1);

    stopB();
    expect(scrollListeners.size).toBe(0);
    expect(resizeListeners.size).toBe(0);
  });

  it('keeps serving other subscribers when one callback throws', async () => {
    const { onScrollFrame } = await loadTicker();
    const after = vi.fn();
    const stopBroken = onScrollFrame({
      read: () => {
        throw new Error('boom');
      },
    });
    const stopOk = onScrollFrame({ read: after });

    flushFrames();

    expect(after).toHaveBeenCalled();
    stopBroken();
    stopOk();
  });
});
