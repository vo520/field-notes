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

interface Taggable {
  data: {
    tags?: readonly string[];
    tech?: readonly string[];
    category?: string;
  };
  id: string;
}

export function getRelatedByTags<T extends Taggable>(entries: readonly T[], current: T, topN = 3): T[] {
  const currentTags = new Set((current.data.tags ?? []).map(normalize));
  const currentTech = new Set((current.data.tech ?? []).map(normalize));
  const currentCategory = current.data.category ?? '';

  const scored = entries
    .filter((candidate) => candidate.id !== current.id)
    .map((candidate) => {
      let score = 0;
      const cTags = (candidate.data.tags ?? []).map(normalize);
      const cTech = (candidate.data.tech ?? []).map(normalize);

      for (const tag of cTags) if (currentTags.has(tag)) score += 2;
      for (const tech of cTech) if (currentTech.has(tech)) score += 1;
      if (currentCategory && candidate.data.category === currentCategory) score += 1;

      return { candidate, score };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((item) => item.candidate);

  return scored.slice(0, topN);
}

function normalize(value: string): string {
  return value.normalize('NFKC').trim().toLowerCase();
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
