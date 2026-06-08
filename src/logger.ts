/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import fs from "fs";
import path from "path";

const logFilePath = path.join(process.cwd(), "scraper-log.txt");

// Initialize clean log file on import or start
try {
  fs.writeFileSync(logFilePath, `[${new Date().toISOString()}] Scraper Logger Initialized\n`);
} catch (e) {
  // Safe fallback if fs is unavailable
}

export const logger = {
  log: (message: string) => {
    const formatted = `[${new Date().toLocaleTimeString()}] ${message}`;
    console.log(formatted);
    try {
      fs.appendFileSync(logFilePath, formatted + "\n");
    } catch (e) {
      // safe fallback
    }
  },
  
  info: (message: string) => {
    logger.log(`INFO: ${message}`);
  },

  success: (message: string) => {
    logger.log(`SUCCESS: ${message}`);
  },

  warn: (message: string) => {
    logger.log(`WARN: ${message}`);
  },

  error: (message: string, error?: any) => {
    const errMessage = error ? ` - ${error.message || String(error)}` : "";
    logger.log(`ERROR: ${message}${errMessage}`);
  },

  clear: () => {
    try {
      fs.writeFileSync(logFilePath, "");
    } catch (e) {}
  },

  getLogFilePath: () => logFilePath,
  
  readLogs: (): string => {
    try {
      if (fs.existsSync(logFilePath)) {
        return fs.readFileSync(logFilePath, "utf8");
      }
    } catch (e) {}
    return "No logs generated yet.";
  }
};
