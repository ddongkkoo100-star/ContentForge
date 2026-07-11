// 이미지 엔진 선택 팩토리
import { Ima2ImageEngine } from "./ima2.js";
import { MockImageEngine } from "./mock.js";

export const IMAGE_ENGINES = ["ima2", "mock"];

// ima2 엔진은 서브프로세스를 들고 있으므로 엔진별 싱글턴으로 재사용한다.
const singletons = new Map();

export function createImageEngine(imageConfig = {}, log) {
  const { engine = "mock" } = imageConfig;
  if (singletons.has(engine)) return singletons.get(engine);
  let instance;
  switch (engine) {
    case "ima2":
      instance = new Ima2ImageEngine(imageConfig, log);
      break;
    case "mock":
      instance = new MockImageEngine();
      break;
    default:
      throw new Error(`알 수 없는 image 엔진: ${engine} (허용: ${IMAGE_ENGINES.join(", ")})`);
  }
  singletons.set(engine, instance);
  return instance;
}
