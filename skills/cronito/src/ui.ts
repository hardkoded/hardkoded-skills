import chalk from 'chalk';
import { table } from 'table';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime.js';
import { Task, ExecutionLog } from './types.js';
import { formatTimeUntil, TaskMetrics } from './scheduler.js';

dayjs.extend(relativeTime);

export function renderTasksTable(tasks: Task[]): void {
  const rows = tasks.map((task) => {
    const statusIcon = task.enabled ? chalk.green('✓') : chalk.red('✗');
    const idShort = task.id.slice(0, 8);
    const commandShort = task.command.length > 30 ? task.command.slice(0, 27) + '...' : task.command;

    return [
      statusIcon,
      chalk.cyan(idShort),
      task.name,
      commandShort,
      task.cron,
      task.lastRun ? (task.lastRun.status === 'success' ? chalk.green('✓') : chalk.red('✗')) : '-',
    ];
  });

  const data = [
    [
      chalk.bold('Status'),
      chalk.bold('ID'),
      chalk.bold('Name'),
      chalk.bold('Command'),
      chalk.bold('Cron'),
      chalk.bold('Last Run'),
    ],
    ...rows,
  ];

  console.log('\n' + table(data));
}

export async function renderUpcomingTasksTable(
  tasks: Array<Task & { nextRun: Date }>
): Promise<void> {
  const rows = tasks.map((task) => {
    const timeUntil = formatTimeUntil(task.nextRun);
    const nextRunTime = dayjs(task.nextRun).format('MMM DD, HH:mm:ss');

    return [
      chalk.cyan(task.id.slice(0, 8)),
      task.name,
      task.cron,
      nextRunTime,
      chalk.gray(timeUntil),
    ];
  });

  const data = [
    [chalk.bold('ID'), chalk.bold('Name'), chalk.bold('Cron'), chalk.bold('Next Run'), chalk.bold('In')],
    ...rows,
  ];

  console.log('\n' + table(data));
}

export function renderExecutionLogs(logs: ExecutionLog[]): void {
  const rows = logs.map((log) => {
    const statusIcon =
      log.status === 'success' ? chalk.green('✓') : log.status === 'failure' ? chalk.red('✗') : chalk.yellow('⟳');
    const timestamp = dayjs(log.timestamp).format('MMM DD HH:mm:ss');
    const duration = `${log.duration}ms`;
    const error = log.error ? (log.error.length > 20 ? log.error.slice(0, 17) + '...' : log.error) : '-';

    return [statusIcon, log.taskName, timestamp, duration, error];
  });

  const data = [
    [chalk.bold('Status'), chalk.bold('Task'), chalk.bold('Timestamp'), chalk.bold('Duration'), chalk.bold('Error')],
    ...rows,
  ];

  console.log('\n' + table(data));
}

export async function renderTaskDetails(task: Task): Promise<void> {
  console.log(chalk.bold.cyan(`\n📋 Task: ${task.name}\n`));

  const details = [
    ['ID', chalk.cyan(task.id)],
    ['Name', task.name],
    ['Command', chalk.gray(task.command)],
    ['Directory', chalk.gray(task.pwd)],
    ['Cron', chalk.cyan(task.cron)],
    ['Status', task.enabled ? chalk.green('Enabled') : chalk.red('Disabled')],
    ['Created', dayjs(task.createdAt).format('MMM DD, YYYY HH:mm:ss')],
  ];

  if (task.lastRun) {
    details.push(['Last Run', dayjs(task.lastRun.timestamp).format('MMM DD, YYYY HH:mm:ss')]);
    details.push(['Last Status', task.lastRun.status === 'success' ? chalk.green('Success') : chalk.red('Failed')]);
    details.push(['Duration', `${task.lastRun.duration}ms`]);
  }

  const data = [
    [chalk.bold('Property'), chalk.bold('Value')],
    ...details,
  ];

  console.log(table(data));
}

export async function renderDashboard(tasks: Task[], metrics: TaskMetrics[], logs: ExecutionLog[]): Promise<void> {
  console.log(chalk.bold.cyan('\n📊 COMPREHENSIVE DASHBOARD\n'));

  // Summary section
  const totalTasks = tasks.length;
  const enabledTasks = tasks.filter((t) => t.enabled).length;
  const stalledTasks = metrics.filter((m) => m.isStalled).length;
  const failedRecently = logs.filter((l) => l.status === 'failure').length > 0;

  console.log(chalk.bold('Overall Status'));
  console.log(`  Total Tasks: ${chalk.cyan(totalTasks)}`);
  console.log(`  Enabled: ${chalk.green(enabledTasks)} | Disabled: ${chalk.yellow(totalTasks - enabledTasks)}`);
  console.log(`  Stalled: ${stalledTasks > 0 ? chalk.red(stalledTasks) : chalk.green('0')}`);
  console.log(`  Recent Failures: ${failedRecently ? chalk.red('Yes') : chalk.green('None')}`);
  console.log();

  // Task metrics table
  console.log(chalk.bold('Task Metrics'));
  const metricRows = metrics.map((m) => {
    const statusIcon = m.isStalled ? chalk.red('⚠') : m.lastRun?.status === 'success' ? chalk.green('✓') : chalk.red('✗');
    const successRate = `${m.successRate.toFixed(0)}%`;
    const lastRun = m.lastRun ? dayjs(m.lastRun.timestamp).fromNow() : chalk.gray('never');
    const stalledInfo = m.isStalled ? chalk.red(`(${m.stalledFor})`) : chalk.gray('-');

    return [
      statusIcon,
      m.taskName.length > 25 ? m.taskName.slice(0, 22) + '...' : m.taskName,
      m.totalRuns,
      successRate,
      `${m.averageDuration}ms`,
      lastRun,
      stalledInfo,
    ];
  });

  const metricData = [
    [
      chalk.bold('Status'),
      chalk.bold('Task'),
      chalk.bold('Runs'),
      chalk.bold('Success'),
      chalk.bold('Avg Duration'),
      chalk.bold('Last Run'),
      chalk.bold('Alert'),
    ],
    ...metricRows,
  ];

  console.log(table(metricData));
  console.log();

  // Alerts section
  const stalledAlerts = metrics.filter((m) => m.isStalled);
  if (stalledAlerts.length > 0) {
    console.log(chalk.bold.red('⚠️  ALERTS'));
    stalledAlerts.forEach((m) => {
      console.log(`  ${chalk.red('→')} "${m.taskName}" stalled for ${m.stalledFor}`);
    });
    console.log();
  }

  // Recent failures
  const recentFailures = logs.filter((l) => l.status === 'failure').slice(0, 5);
  if (recentFailures.length > 0) {
    console.log(chalk.bold.yellow('❌ Recent Failures'));
    recentFailures.forEach((l) => {
      const time = dayjs(l.timestamp).format('MMM DD HH:mm');
      const error = l.error || 'Unknown error';
      console.log(`  ${chalk.yellow('→')} ${l.taskName} (${time}): ${error.slice(0, 40)}`);
    });
    console.log();
  }

  // Quick stats
  const totalRuns = metrics.reduce((sum, m) => sum + m.totalRuns, 0);
  const totalSuccess = metrics.reduce((sum, m) => sum + m.successCount, 0);
  const overallSuccessRate = totalRuns === 0 ? 0 : ((totalSuccess / totalRuns) * 100).toFixed(1);
  const avgDuration = metrics.length === 0 ? 0 : Math.round(metrics.reduce((sum, m) => sum + m.averageDuration, 0) / metrics.length);

  console.log(chalk.bold('Aggregate Statistics'));
  console.log(`  Total Executions: ${chalk.cyan(totalRuns.toString())}`);
  const successRateNum = parseFloat(overallSuccessRate as string);
  console.log(`  Overall Success Rate: ${successRateNum > 95 ? chalk.green(overallSuccessRate + '%') : chalk.yellow(overallSuccessRate + '%')}`);
  console.log(`  Average Duration: ${chalk.cyan(avgDuration + 'ms')}`);
  console.log();

  console.log(chalk.dim('Tip: Use "cronito logs <task-id>" for detailed execution history'));
}
