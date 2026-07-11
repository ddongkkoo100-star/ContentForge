// Writer 어댑터 공통 인터페이스.
// 모든 어댑터는 텍스트 생성만 담당한다 — 파일 쓰기 권한 불필요.
export class WriterAdapter {
  name = "base";

  /**
   * CLI 설치/로그인 상태 확인.
   * @returns {Promise<{available: boolean, version?: string, reason?: string}>}
   */
  async isAvailable() {
    return { available: false, reason: "구현되지 않은 어댑터" };
  }

  /**
   * 텍스트 생성. 재시도는 호출부(withRetries)에서 감싼다.
   * @param {{system?: string, prompt: string, task?: string}} req
   * @returns {Promise<{text: string, meta: object}>}
   */
  async generate() {
    throw new Error(`${this.name} 어댑터의 generate()가 구현되지 않았습니다`);
  }
}

/** 재시도 래퍼 — CLI 출력 불안정 대응 (기본 2회 재시도). */
export async function withRetries(fn, { maxRetries = 2, onRetry } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries && onRetry) onRetry(err, attempt + 1);
    }
  }
  throw lastErr;
}
