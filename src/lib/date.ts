/**
 * 站内日期统一按北京时间格式化，避免本地（Asia/Shanghai）与 CI（UTC）构建出不同日期。
 * 所有面向访客的日期都从这里取，避免各组件各自维护一份 Intl 配置而漂移。
 */
const TIME_ZONE = 'Asia/Shanghai';

/** 2026年11月25日 */
const longDate = new Intl.DateTimeFormat('zh-CN', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: 'long',
  day: 'numeric',
});

/** 2026/11/25 */
const compactDate = new Intl.DateTimeFormat('zh-CN', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** 2026-11-25，用于归档页按年/月分组 */
const archiveDate = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

export function formatLongDate(date: Date): string {
  return longDate.format(date);
}

export function formatCompactDate(date: Date): string {
  return compactDate.format(date);
}

export function formatArchiveDate(date: Date): string {
  return archiveDate.format(date);
}
