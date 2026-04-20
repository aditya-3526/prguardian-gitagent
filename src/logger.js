'use strict';

/**
 * PRGuardian Structured Logger
 *
 * Logs with [PRGuardian] prefix and ISO timestamps.
 * Supports console output + optional file persistence.
 */

const fs = require('fs');
const path = require('path');

class Logger {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.logToFile = options.logToFile || false;
    this.logDir = options.logDir || path.join(process.cwd(), 'logs');
    this.entries = [];
  }

  /**
   * Log at INFO level.
   */
  info(message, data) {
    this._log('INFO', message, data);
  }

  /**
   * Log at DEBUG level (only if verbose).
   */
  debug(message, data) {
    if (this.verbose) {
      this._log('DEBUG', message, data);
    }
    // Always store for file logging
    this._store('DEBUG', message, data);
  }

  /**
   * Log at WARN level.
   */
  warn(message, data) {
    this._log('WARN', message, data);
  }

  /**
   * Log at ERROR level.
   */
  error(message, data) {
    this._log('ERROR', message, data);
  }

  /**
   * Internal log method.
   */
  _log(level, message, data) {
    const timestamp = new Date().toISOString();
    const prefix = `[PRGuardian] [${level}] [${timestamp}]`;

    if (typeof data === 'object' && data !== null) {
      console.log(`${prefix} ${message}:`, JSON.stringify(data, null, 2));
    } else if (data !== undefined) {
      console.log(`${prefix} ${message}: ${data}`);
    } else {
      console.log(`${prefix} ${message}`);
    }

    this._store(level, message, data);
  }

  /**
   * Store log entry for file persistence.
   */
  _store(level, message, data) {
    this.entries.push({
      level,
      timestamp: new Date().toISOString(),
      message,
      data: data || null
    });
  }

  /**
   * Persist all log entries to a JSON file.
   */
  persist() {
    if (!this.logToFile || this.entries.length === 0) return null;

    try {
      if (!fs.existsSync(this.logDir)) {
        fs.mkdirSync(this.logDir, { recursive: true });
      }

      const filename = `run-${Date.now()}.json`;
      const filepath = path.join(this.logDir, filename);

      fs.writeFileSync(filepath, JSON.stringify({
        run_timestamp: new Date().toISOString(),
        entries: this.entries
      }, null, 2));

      return filepath;
    } catch (err) {
      console.error(`[PRGuardian] [ERROR] Failed to persist logs: ${err.message}`);
      return null;
    }
  }
}

module.exports = Logger;
