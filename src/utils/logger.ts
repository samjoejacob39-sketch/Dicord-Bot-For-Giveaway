import fs from "fs";
import path from "path";

type LogLevel = "debug" | "info" | "warn" | "error";

const LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

let currentLevel: LogLevel = "info";
let logFile: fs.WriteStream | null = null;

export function setLogLevel(level: LogLevel): void {
  currentLevel = level;
}

export function setLogFile(filePath: string): void {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    logFile = fs.createWriteStream(filePath, { flags: "a" });
  } catch {
    // ignore
  }
}

function shouldLog(level: LogLevel): boolean {
  return LEVELS[level] >= LEVELS[currentLevel];
}

function timestamp(): string {
  return new Date().toISOString();
}

function write(level: LogLevel, msg: string, args: any[]): void {
  const line = `[${timestamp()}] [${level.toUpperCase()}] ${msg} ${args.length ? JSON.stringify(args) : ""}`;
  if (logFile) {
    logFile.write(line + "\n");
  }
}

export const logger = {
  debug: (msg: string, ...args: any[]) => {
    if (shouldLog("debug")) {
      console.debug(`[${timestamp()}] [DEBUG] ${msg}`, ...args);
      write("debug", msg, args);
    }
  },
  info: (msg: string, ...args: any[]) => {
    if (shouldLog("info")) {
      console.log(`[${timestamp()}] [INFO] ${msg}`, ...args);
      write("info", msg, args);
    }
  },
  warn: (msg: string, ...args: any[]) => {
    if (shouldLog("warn")) {
      console.warn(`[${timestamp()}] [WARN] ${msg}`, ...args);
      write("warn", msg, args);
    }
  },
  error: (msg: string, ...args: any[]) => {
    if (shouldLog("error")) {
      console.error(`[${timestamp()}] [ERROR] ${msg}`, ...args);
      write("error", msg, args);
    }
  },
};
