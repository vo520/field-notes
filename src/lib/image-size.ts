import { readFileSync } from 'node:fs';
import { resolve, sep } from 'node:path';

export interface ImageSize {
  width: number;
  height: number;
}

const PUBLIC_DIR = resolve(process.cwd(), 'public');

/**
 * 读图片真实像素尺寸，支持仓库现有的 PNG / JPEG / WebP / SVG。
 * 无法识别的格式返回 null，由调用方决定是否回退到手填值。
 */
export function readImageSize(filePath: string): ImageSize | null {
  const buffer = readFileSync(filePath);
  const extension = filePath.slice(filePath.lastIndexOf('.')).toLowerCase();

  if (extension === '.png' && buffer.length > 24 && buffer.toString('ascii', 12, 16) === 'IHDR') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }

  if (extension === '.svg') {
    const source = buffer.toString('utf8');
    const width = source.match(/\bwidth="(\d+)"/)?.[1];
    const height = source.match(/\bheight="(\d+)"/)?.[1];
    if (width && height) return { width: Number(width), height: Number(height) };

    const viewBox = source.match(/\bviewBox="[\d.-]+\s+[\d.-]+\s+([\d.]+)\s+([\d.]+)"/);
    if (viewBox) return { width: Math.round(Number(viewBox[1])), height: Math.round(Number(viewBox[2])) };
  }

  if (extension === '.jpg' || extension === '.jpeg') {
    let offset = 2;
    while (offset + 9 < buffer.length) {
      if (buffer[offset] !== 0xff) {
        offset += 1;
        continue;
      }

      const marker = buffer[offset + 1]!;
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }

      offset += 2 + buffer.readUInt16BE(offset + 2);
    }
  }

  if (extension === '.webp' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    const chunk = buffer.toString('ascii', 12, 16);

    if (chunk === 'VP8X') {
      const width = buffer.readUIntLE(24, 3) + 1;
      const height = buffer.readUIntLE(27, 3) + 1;
      return { width, height };
    }

    if (chunk === 'VP8 ') {
      return {
        width: buffer.readUInt16LE(26) & 0x3fff,
        height: buffer.readUInt16LE(28) & 0x3fff,
      };
    }

    if (chunk === 'VP8L') {
      const bits = buffer.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
  }

  return null;
}

/** 按站内 `/images/...` 路径读 public 下的实际像素；路径不在 public/images 内或文件不存在时返回 null */
export function readPublicImageSize(src: string): ImageSize | null {
  if (!src.startsWith('/images/')) return null;

  const filePath = resolve(PUBLIC_DIR, src.slice(1));
  if (!filePath.startsWith(`${PUBLIC_DIR}${sep}`)) return null;

  try {
    return readImageSize(filePath);
  } catch {
    return null;
  }
}
