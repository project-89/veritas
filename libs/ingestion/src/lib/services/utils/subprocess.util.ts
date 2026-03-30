import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { promisify } from 'util';

const execFileAsync = promisify(execFile);

export interface SubprocessOptions {
  timeout?: number;
  maxBuffer?: number;
  cwd?: string;
  env?: Record<string, string>;
}

export interface SubprocessResult {
  stdout: string;
  stderr: string;
  exitCode: number;
}

@Injectable()
export class SubprocessUtil {
  private readonly logger = new Logger(SubprocessUtil.name);

  /**
   * Execute a command using execFile (no shell injection risk)
   */
  async exec(
    command: string,
    args: string[],
    options?: SubprocessOptions
  ): Promise<SubprocessResult> {
    const timeout = options?.timeout ?? 30000;
    const maxBuffer = options?.maxBuffer ?? 10 * 1024 * 1024; // 10MB

    this.logger.debug(`Executing: ${command} ${args.join(' ')}`);

    try {
      const result = await execFileAsync(command, args, {
        timeout,
        maxBuffer,
        cwd: options?.cwd,
        env: options?.env ? { ...process.env, ...options.env } : undefined,
      });

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: 0,
      };
    } catch (error: any) {
      // execFile errors include stdout/stderr on failure
      if (error.code === 'ETIMEDOUT') {
        this.logger.error(
          `Command timed out after ${timeout}ms: ${command} ${args.join(' ')}`
        );
        throw new Error(
          `Command timed out after ${timeout}ms: ${command} ${args.join(' ')}`
        );
      }

      // Command executed but returned non-zero exit code
      if (error.stdout !== undefined || error.stderr !== undefined) {
        return {
          stdout: error.stdout || '',
          stderr: error.stderr || '',
          exitCode: error.code ?? 1,
        };
      }

      this.logger.error(`Command failed: ${command} ${args.join(' ')}`, error);
      throw error;
    }
  }

  /**
   * Execute a command and parse stdout as JSON
   */
  async execJson<T>(
    command: string,
    args: string[],
    options?: SubprocessOptions
  ): Promise<T> {
    const result = await this.exec(command, args, options);

    if (result.exitCode !== 0) {
      throw new Error(
        `Command exited with code ${result.exitCode}: ${result.stderr}`
      );
    }

    try {
      return JSON.parse(result.stdout) as T;
    } catch {
      throw new Error(
        `Failed to parse JSON output from ${command}: ${result.stdout.slice(0, 200)}`
      );
    }
  }

  /**
   * Execute a command and parse each line of stdout as a separate JSON object
   */
  async execJsonLines<T>(
    command: string,
    args: string[],
    options?: SubprocessOptions
  ): Promise<T[]> {
    const result = await this.exec(command, args, options);

    if (result.exitCode !== 0) {
      throw new Error(
        `Command exited with code ${result.exitCode}: ${result.stderr}`
      );
    }

    const lines = result.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    return lines.map((line, index) => {
      try {
        return JSON.parse(line) as T;
      } catch {
        throw new Error(
          `Failed to parse JSON on line ${index + 1}: ${line.slice(0, 200)}`
        );
      }
    });
  }

  /**
   * Check if a command-line tool is available on the system
   */
  async checkAvailability(command: string): Promise<boolean> {
    try {
      const result = await this.exec('which', [command], { timeout: 5000 });
      return result.exitCode === 0 && result.stdout.trim().length > 0;
    } catch {
      return false;
    }
  }
}
