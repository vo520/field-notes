/**
 * 共享滚动帧调度器：把分散在各组件的 scroll 监听收敛到一处。
 *
 * 改造前：阅读进度、返回顶部、目录高亮、Header 显隐、Hero 视差、sticky 舞台
 * 各自注册 scroll 监听 + 各自的 requestAnimationFrame。同一次滚动会触发多次
 * scrollTop / scrollHeight / getBoundingClientRect 读取，每次读取都强制同步布局，
 * 造成 layout thrashing；长文页滚动时这条链路尤其明显。
 *
 * 改造后：一帧只跑一次，先执行所有「读」回调（读几何信息），再执行所有「写」回调
 * （写样式 / class / 文案），一轮滚动最多触发一次强制布局。
 *
 * 订阅者必须在 cleanup 里解绑（页面生命周期内核会调用），否则解绑最后一个订阅者时
 * 会自动摘掉 window 上的监听，避免跨页面累积。
 */

export interface ScrollFrameHandlers {
  /** 读阶段：读取滚动位置与元素几何信息。此阶段不要写样式，避免读写交错。 */
  read?: () => void;
  /** 写阶段：写入样式、class 与文案。 */
  write?: () => void;
}

interface Subscriber {
  handlers: ScrollFrameHandlers;
}

const subscribers = new Set<Subscriber>();
let rafId = 0;
let attached = false;

const flush = () => {
  rafId = 0;
  // 读阶段：所有几何读取集中在这里，一轮只触发一次布局计算
  subscribers.forEach((subscriber) => {
    try {
      subscriber.handlers.read?.();
    } catch {
      /* 单个订阅者异常不阻断其它订阅者 */
    }
  });
  // 写阶段：集中写样式，浏览器可以合并成一次绘制
  subscribers.forEach((subscriber) => {
    try {
      subscriber.handlers.write?.();
    } catch {
      /* 同上 */
    }
  });
};

const schedule = () => {
  if (rafId) return;
  rafId = window.requestAnimationFrame(flush);
};

const attach = () => {
  if (attached) return;
  attached = true;
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('resize', schedule, { passive: true });
};

const detachIfIdle = () => {
  if (!attached || subscribers.size > 0) return;
  attached = false;
  window.removeEventListener('scroll', schedule);
  window.removeEventListener('resize', schedule);
  if (rafId) window.cancelAnimationFrame(rafId);
  rafId = 0;
};

/**
 * 订阅滚动帧更新。返回解绑函数。
 * 首次订阅会立即排一帧，保证首屏状态（滚动位置、目录高亮、进度条）正确。
 */
export function onScrollFrame(handlers: ScrollFrameHandlers): () => void {
  const subscriber: Subscriber = { handlers };
  subscribers.add(subscriber);
  attach();
  schedule();
  return () => {
    subscribers.delete(subscriber);
    detachIfIdle();
  };
}
