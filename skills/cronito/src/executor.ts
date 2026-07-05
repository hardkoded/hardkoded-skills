import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import { ExecutionLog } from './types.js';
import { getHistoryFile } from './config.js';

const execAsync = promisify(exec);

export interface ExecutionResult {
  status: 'success' | 'failure';
  duration: number;
  stdout: string;
  stderr: string;
  error?: string;
}

export async function executeCommand(
  command: string,
  cwd: string = process.cwd()
): Promise<ExecutionResult> {
  const startTime = Date.now();

  try {
    // Validate that pwd exists
    if (!fs.existsSync(cwd)) {
      throw new Error(`Working directory does not exist: ${cwd}`);
    }

    const { stdout, stderr } = await execAsync(command, {
      cwd,
      timeout: 3600000, // 1 hour timeout
      maxBuffer: 10 * 1024 * 1024, // 10MB buffer
    });

    const duration = Date.now() - startTime;

    return {
      status: 'success',
      duration,
      stdout,
      stderr,
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : String(error);

    return {
      status: 'failure',
      duration,
      stdout: '',
      stderr: errorMessage,
      error: errorMessage,
    };
  }
}

export async function logExecution(log: ExecutionLog): Promise<void> {
  const historyFile = getHistoryFile();
  const logLine = JSON.stringify(log) + '\n';
  fs.appendFileSync(historyFile, logLine);
}

export async function getExecutionHistory(
  taskId?: string,
  limit: number = 50
): Promise<ExecutionLog[]> {
  const historyFile = getHistoryFile();

  if (!fs.existsSync(historyFile)) {
    return [];
  }

  const lines = fs.readFileSync(historyFile, 'utf-8').split('\n').filter((l: string) => l);

  return lines
    .map((line: string) => {
      try {
        return JSON.parse(line) as ExecutionLog;
      } catch {
        return null;
      }
    })
    .filter((log): log is ExecutionLog => log !== null)
    .filter((log) => !taskId || log.taskId === taskId)
    .reverse()
    .slice(0, limit);
}
