import parser from 'cron-parser';
import dayjs from 'dayjs';
import { getAllTasks } from './config.js';
import { executeCommand, logExecution } from './executor.js';
import { notifyTaskResult } from './notifier.js';
import { Task, ExecutionLog } from './types.js';

export async function getTasksThatShouldRun(): Promise<Task[]> {
  const tasks = await getAllTasks();
  const now = new Date();

  return tasks.filter((task) => {
    if (!task.enabled) return false;

    try {
      const interval = parser.parseExpression(task.cron);
      const prevRun = interval.prev().toDate();

      // Check if current time is between the previous run and now
      // (with a 1-minute window for cron execution)
      const timeSincePrevRun = now.getTime() - prevRun.getTime();
      return timeSincePrevRun >= 0 && timeSincePrevRun < 60000; // within 1 minute
    } catch {
      return false;
    }
  });
}

export async function getNextRun(cronExpression: string): Promise<Date | null> {
  try {
    const interval = parser.parseExpression(cronExpression);
    return interval.next().toDate();
  } catch {
    return null;
  }
}

export async function runScheduler(): Promise<void> {
  const tasksToRun = await getTasksThatShouldRun();

  if (tasksToRun.length === 0) {
    return;
  }

  // Run all matching tasks in parallel
  await Promise.allSettled(tasksToRun.map((task) => runTask(task)));
}

async function runTask(task: Task): Promise<void> {
  const startTime = Date.now();
  const log: ExecutionLog = {
    taskId: task.id,
    taskName: task.name,
    timestamp: new Date().toISOString(),
    status: 'running',
    duration: 0,
  };

  try {
    const result = await executeCommand(task.command, task.pwd);
    const duration = Date.now() - startTime;

    const executionLog: ExecutionLog = {
      ...log,
      status: result.status,
      duration,
      stdout: result.stdout,
      stderr: result.stderr,
      error: result.error,
    };

    await logExecution(executionLog);
    await notifyTaskResult(task, result.status, duration, result.error);
  } catch (error) {
    const duration = Date.now() - startTime;
    const errorMsg = error instanceof Error ? error.message : String(error);

    await logExecution({
      ...log,
      status: 'failure',
      duration,
      error: errorMsg,
    });
    await notifyTaskResult(task, 'failure', duration, errorMsg);
  }
}

export function validateCronExpression(cron: string): { valid: boolean; error?: string } {
  try {
    parser.parseExpression(cron);
    return { valid: true };
  } catch (error) {
    return {
      valid: false,
      error: error instanceof Error ? error.message : 'Invalid cron expression',
    };
  }
}

export async function getUpcomingTasks(count: number = 5): Promise<Array<Task & { nextRun: Date }>> {
  const tasks = await getAllTasks();

  const upcoming = await Promise.all(
    tasks
      .filter((t) => t.enabled)
      .map(async (task) => {
        const nextRun = await getNextRun(task.cron);
        return { ...task, nextRun: nextRun || new Date() };
      })
  );

  return upcoming.sort((a, b) => a.nextRun.getTime() - b.nextRun.getTime()).slice(0, count);
}

export function formatTimeUntil(date: Date): string {
  const now = dayjs();
  const target = dayjs(date);
  const diff = target.diff(now);

  if (diff < 0) return 'now';

  const minutes = Math.floor(diff / 60000);
  const hours = Math.floor(diff / 3600000);
  const days = Math.floor(diff / 86400000);

  if (minutes < 1) return 'in a few seconds';
  if (minutes < 60) return `in ${minutes} minute${minutes !== 1 ? 's' : ''}`;
  if (hours < 24) return `in ${hours} hour${hours !== 1 ? 's' : ''}`;
  return `in ${days} day${days !== 1 ? 's' : ''}`;
}

export interface TaskMetrics {
  taskId: string;
  taskName: string;
  totalRuns: number;
  successCount: number;
  failureCount: number;
  successRate: number;
  lastRun?: {
    timestamp: Date;
    status: 'success' | 'failure';
    duration: number;
  };
  averageDuration: number;
  isStalled: boolean;
  stalledFor?: string;
}

export async function getTaskMetrics(
  taskId: string,
  logs: any[]
): Promise<TaskMetrics> {
  const task = await getAllTasks().then((t) => t.find((x) => x.id === taskId));
  if (!task) throw new Error(`Task not found: ${taskId}`);

  const taskLogs = logs.filter((l) => l.taskId === taskId);
  const successCount = taskLogs.filter((l) => l.status === 'success').length;
  const failureCount = taskLogs.filter((l) => l.status === 'failure').length;
  const totalRuns = taskLogs.length;

  const successRate = totalRuns === 0 ? 0 : (successCount / totalRuns) * 100;

  const durations = taskLogs.map((l) => l.duration);
  const averageDuration = durations.length === 0 ? 0 : Math.round(durations.reduce((a, b) => a + b) / durations.length);

  const lastLog = taskLogs[0];
  const lastRun = lastLog
    ? {
        timestamp: new Date(lastLog.timestamp),
        status: lastLog.status,
        duration: lastLog.duration,
      }
    : undefined;

  // Check if task is stalled (should have run but hasn't in expected time)
  const isStalled = !task.enabled ? false : checkIfStalled(task, lastRun);
  const stalledFor = isStalled ? calculateStalledTime(task) : undefined;

  return {
    taskId: task.id,
    taskName: task.name,
    totalRuns,
    successCount,
    failureCount,
    successRate,
    lastRun,
    averageDuration,
    isStalled,
    stalledFor,
  };
}

function checkIfStalled(task: Task, lastRun?: any): boolean {
  // A task is stalled if it hasn't run when it should have
  // Check if the last expected run time has passed and we haven't logged it
  try {
    const interval = parser.parseExpression(task.cron);
    const lastExpectedRun = interval.prev().toDate();
    const now = new Date();

    // If last expected run was more than 5 minutes ago, consider it stalled
    const timeSinceExpected = now.getTime() - lastExpectedRun.getTime();
    const fiveMinutes = 5 * 60 * 1000;

    if (timeSinceExpected > fiveMinutes) {
      // Check if we have a recent log for this time
      if (!lastRun || new Date(lastRun.timestamp).getTime() < lastExpectedRun.getTime()) {
        return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}

function calculateStalledTime(task: Task): string {
  try {
    const interval = parser.parseExpression(task.cron);
    const lastExpectedRun = interval.prev().toDate();
    const now = new Date();
    const stalledMs = now.getTime() - lastExpectedRun.getTime();

    const minutes = Math.floor(stalledMs / 60000);
    const hours = Math.floor(stalledMs / 3600000);

    if (hours > 0) return `${hours} hour${hours !== 1 ? 's' : ''} ${minutes % 60} min`;
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  } catch {
    return 'unknown';
  }
}
