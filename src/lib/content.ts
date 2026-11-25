interface DatedEntry {
  data: {
    publishedAt: Date;
  };
  slug?: string;
}

interface DraftEntry {
  data: {
    draft: boolean;
  };
}

export function estimateReadingTime(body: string): number {
  const chineseCharacters = body.match(/[\u3400-\u9fff]/g)?.length ?? 0;
  const latinWords = body.match(/[A-Za-z0-9]+(?:['’-][A-Za-z0-9]+)*/g)?.length ?? 0;
  const minutes = chineseCharacters / 300 + latinWords / 200;

  return Math.max(1, Math.ceil(minutes));
}

export function sortByPublishedAt<T extends DatedEntry>(entries: readonly T[]): T[] {
  return [...entries].sort((left, right) => {
    const diff = right.data.publishedAt.getTime() - left.data.publishedAt.getTime();
    if (diff !== 0) return diff;

    const leftSlug = left.slug ?? '';
    const rightSlug = right.slug ?? '';
    return leftSlug.localeCompare(rightSlug);
  });
}

export function isVisibleEntry<T extends DraftEntry>(entry: T, isProduction: boolean): boolean {
  return !isProduction || !entry.data.draft;
}

export function toTagSlug(tag: string): string {
  return tag
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[\\/?#%&+]+/g, ' ')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}
