import { execFile } from 'child_process';
import { promisify } from 'util';
import { Task } from './types.js';

const execFileAsync = promisify(execFile);

/** Escape a string for safe embedding inside an AppleScript double-quoted literal. */
function escapeForAppleScript(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

/** Collapse to a single trimmed line and cap length so notifications stay readable. */
function toNotificationLine(value: string, maxLength = 200): string {
  const oneLine = value.replace(/\s+/g, ' ').trim();
  return oneLine.length > maxLength ? `${oneLine.slice(0, maxLength - 1)}…` : oneLine;
}

/**
 * Post a macOS notification via osascript. Best-effort: never throws, so a
 * notification problem can't break a scheduled run. No-op off macOS.
 */
export async function sendMacNotification(
  title: string,
  message: string,
  subtitle?: string
): Promise<void> {
  if (process.platform !== 'darwin') return;

  const parts = [
    `display notification "${escapeForAppleScript(message)}"`,
    `with title "${escapeForAppleScript(title)}"`,
  ];
  if (subtitle) {
    parts.push(`subtitle "${escapeForAppleScript(subtitle)}"`);
  }

  try {
    // execFile (not exec) so task names / error text can't be shell-interpreted.
    await execFileAsync('osascript', ['-e', parts.join(' ')]);
  } catch {
    // Swallow — notifications are advisory and must never affect task execution.
  }
}

/**
 * Decide whether a finished task should notify, and post it. Failures notify by
 * default (opt-out via notifyOnFailure:false); successes are opt-in
 * (notifyOnSuccess:true).
 */
export async function notifyTaskResult(
  task: Task,
  status: 'success' | 'failure',
  duration: number,
  error?: string
): Promise<void> {
  const durationSeconds = (duration / 1000).toFixed(1);

  if (status === 'failure') {
    if (task.notifyOnFailure === false) return;
    const detail = error ? toNotificationLine(error) : 'See "cronito logs" for details.';
    await sendMacNotification(`✗ ${task.name} failed`, detail, `Ran for ${durationSeconds}s`);
    return;
  }

  if (task.notifyOnSuccess === true) {
    await sendMacNotification(`✓ ${task.name} succeeded`, `Completed in ${durationSeconds}s`);
  }
}
