#!/usr/bin/env node
// ContentForge CLI — serve | doctor
import { loadConfig } from "../src/config.js";
import { runDoctor, formatDoctorReport } from "../src/doctor.js";

const [, , command = "serve"] = process.argv;

async function main() {
  const config = loadConfig();
  switch (command) {
    case "serve": {
      const { startServer } = await import("../src/server.js");
      const { server } = await startServer(config);
      const { port } = server.address();
      console.log(`ContentForge — http://localhost:${port}`);
      console.log(`  writer=${config.writer.engine}, image=${config.image.engine}`);
      break;
    }
    case "doctor": {
      const report = await runDoctor(config);
      console.log(formatDoctorReport(report));
      // CLI/이미지 엔진은 없어도 mock 모드로 동작하므로, node 요건만 실패로 친다.
      const nodeCheck = report.checks.find((c) => c.name === "node");
      process.exitCode = nodeCheck?.ok ? 0 : 1;
      break;
    }
    default:
      console.error(`알 수 없는 명령: ${command}\n사용법: contentforge [serve|doctor]`);
      process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
