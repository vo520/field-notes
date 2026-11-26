import resumeData from '../data/resume.json';
import { resumeSchema } from '../lib/resume-schema';
import { z } from 'astro/zod';

/** 简历内容唯一数据源是 src/data/resume.json（后台可编辑），构建期用 zod 校验 */
export const resumeConfig = (() => {
  try {
    return resumeSchema.parse(resumeData);
  } catch (error) {
    const detail = error instanceof z.ZodError
      ? error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('；')
      : String(error);
    throw new Error(`src/data/resume.json 校验失败：${detail}`, { cause: error });
  }
})();

export type ResumeConfig = typeof resumeConfig;
