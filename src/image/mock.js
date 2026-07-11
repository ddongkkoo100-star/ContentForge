// MockImageEngine — 의존성 없이 node:zlib로 유효한 단색 PNG를 만든다.
// CLI/OAuth 없이도 전체 파이프라인 데모가 가능해야 한다 (§5.2).
import { deflateSync } from "node:zlib";

const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/** 단색 PNG 생성 (프롬프트 해시로 색을 정해 셀마다 구분되게) */
export function makePlaceholderPng(width, height, seedText = "") {
  let hash = 5381;
  for (const ch of seedText) hash = ((hash << 5) + hash + ch.charCodeAt(0)) | 0;
  // 다크 UI 위에서 보기 좋은 저채도 톤 — 채널 간 차이를 작게 유지
  const base = 52 + (Math.abs(hash) % 30);
  const r = base + (Math.abs(hash >> 8) % 20);
  const g = base + (Math.abs(hash >> 12) % 20);
  const b = base + 10 + (Math.abs(hash >> 16) % 22);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // color type: truecolor
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = r;
    row[2 + x * 3] = g;
    row[3 + x * 3] = b;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

export class MockImageEngine {
  name = "mock";

  async health() {
    return { available: true, detail: "mock 플레이스홀더", oauth: null };
  }

  /**
   * @param {{prompt: string, size: string, n?: number}} req
   * @returns {Promise<{buffers: Buffer[], meta: object}>}
   */
  async generate({ prompt, size = "1024x1024", n = 1 }) {
    const [w, h] = size.split("x").map(Number);
    if (!w || !h) throw new Error(`잘못된 size: ${size}`);
    const buffers = Array.from({ length: n }, (_, i) => makePlaceholderPng(w, h, `${prompt}#${i}`));
    return { buffers, meta: { engine: this.name, size, elapsed: 0 } };
  }

  async stop() {}
}
