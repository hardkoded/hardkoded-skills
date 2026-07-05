export interface Task {
  id: string;
  name: string;
  command: string;
  cron: string;
  pwd: string;
  enabled: boolean;
  tags?: string[];
  /** Post a macOS notification when this task fails. Defaults to true (opt-out). */
  notifyOnFailure?: boolean;
  /** Post a macOS notification when this task succeeds. Defaults to false (opt-in). */
  notifyOnSuccess?: boolean;
  createdAt: string;
  lastRun?: {
    timestamp: string;
    status: 'success' | 'failure';
    duration: number;
    error?: string;
  };
}

export interface Config {
  version: string;
  tasks: Task[];
}

export interface ExecutionLog {
  taskId: string;
  taskName: string;
  timestamp: string;
  status: 'success' | 'failure' | 'running';
  duration: number;
  stdout?: string;
  stderr?: string;
  error?: string;
}

export interface CronPreset {
  label: string;
  cron: string;
  description: string;
}
