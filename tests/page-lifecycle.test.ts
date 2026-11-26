import { beforeEach, describe, expect, it, vi } from 'vitest';

class MockTarget {
  private listeners = new Map<string, Set<(event?: unknown) => void>>();

  addEventListener(name: string, listener: (event?: unknown) => void) {
    const set = this.listeners.get(name) ?? new Set();
    set.add(listener);
    this.listeners.set(name, set);
  }

  removeEventListener(name: string, listener: (event?: unknown) => void) {
    this.listeners.get(name)?.delete(listener);
  }

  dispatch(name: string) {
    [...(this.listeners.get(name) ?? [])].forEach((listener) => listener());
  }
}

let mockDocument: MockTarget & { readyState: string };
let mockWindow: MockTarget & { __pageLifecycleAttached?: boolean };

beforeEach(() => {
  vi.resetModules();
  mockDocument = Object.assign(new MockTarget(), { readyState: 'loading' });
  mockWindow = new MockTarget();
  vi.stubGlobal('document', mockDocument);
  vi.stubGlobal('window', mockWindow);
});

const loadLifecycle = async () => await import('../src/lib/page-lifecycle');

describe('page lifecycle', () => {
  it('runs an init exactly once on the first page load', async () => {
    const { registerPageInit } = await loadLifecycle();
    const init = vi.fn();
    registerPageInit(init);

    // 浏览器解析完成后先触发 DOMContentLoaded，Astro 路由器随后在 window.load 派发 astro:page-load
    mockDocument.readyState = 'interactive';
    mockDocument.dispatch('DOMContentLoaded');
    mockDocument.dispatch('astro:page-load');

    expect(init).toHaveBeenCalledTimes(1);
  });

  it('runs the init again after a swap but not on the initial load twice', async () => {
    const { registerPageInit } = await loadLifecycle();
    const init = vi.fn();
    registerPageInit(init);

    mockDocument.dispatch('DOMContentLoaded');
    mockDocument.dispatch('astro:page-load');
    expect(init).toHaveBeenCalledTimes(1);

    mockDocument.dispatch('astro:before-swap');
    mockDocument.dispatch('astro:page-load');
    expect(init).toHaveBeenCalledTimes(2);
  });

  it('cleans up exactly once per page generation', async () => {
    const { registerPageInit } = await loadLifecycle();
    const cleanup = vi.fn();
    registerPageInit(() => cleanup);

    mockDocument.dispatch('DOMContentLoaded');
    mockDocument.dispatch('astro:page-load');
    mockDocument.dispatch('astro:before-swap');

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('discards a cleanup that resolves after the page was swapped', async () => {
    const { registerPageInit } = await loadLifecycle();
    const cleanup = vi.fn();
    let resolveInit: (value: () => void) => void = () => {};
    registerPageInit(() => new Promise<() => void>((resolve) => { resolveInit = resolve; }));

    mockDocument.dispatch('DOMContentLoaded');
    mockDocument.dispatch('astro:page-load');
    mockDocument.dispatch('astro:before-swap');
    resolveInit(cleanup);
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledTimes(1));

    // 后代际的页面不应再执行上一页遗留的清理
    mockDocument.dispatch('astro:page-load');
    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it('runs once when View Transitions are unavailable', async () => {
    const { registerPageInit } = await loadLifecycle();
    const init = vi.fn();
    registerPageInit(init);

    mockDocument.dispatch('DOMContentLoaded');
    expect(init).toHaveBeenCalledTimes(1);
  });
});
