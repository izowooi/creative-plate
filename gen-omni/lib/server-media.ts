import sharp from "sharp";
import { parseBuffer } from "music-metadata";

export async function compressReferenceImage(file: File): Promise<Buffer> {
  const source = Buffer.from(await file.arrayBuffer());
  return sharp(source, { failOn: "error" })
    .rotate()
    .resize({ width: 2048, height: 2048, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 84, mozjpeg: true })
    .toBuffer();
}

export async function readVideoDuration(file: File): Promise<number> {
  const data = Buffer.from(await file.arrayBuffer());
  const metadata = await parseBuffer(data, { mimeType: file.type, size: file.size }, { duration: true });
  return metadata.format.duration ?? readMp4Duration(data);
}

export function readMp4Duration(data: Buffer): number {
  const marker = Buffer.from("mvhd", "ascii");
  const index = data.indexOf(marker);
  if (index < 0 || index + 24 >= data.length) return Number.NaN;
  const version = data.readUInt8(index + 4);
  if (version === 0) {
    const timescale = data.readUInt32BE(index + 16);
    const duration = data.readUInt32BE(index + 20);
    return timescale > 0 ? duration / timescale : Number.NaN;
  }
  if (version === 1 && index + 36 <= data.length) {
    const timescale = data.readUInt32BE(index + 24);
    const duration = data.readBigUInt64BE(index + 28);
    return timescale > 0 ? Number(duration) / timescale : Number.NaN;
  }
  return Number.NaN;
}
