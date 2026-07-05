#!/usr/bin/env node

import { Command } from 'commander';
import { v4 as uuidv4 } from 'uuid';
import chalk from 'chalk';
import inquirer from 'inquirer';
import { initializeConfig, getAllTasks, getTask, addTask, updateTask, removeTask } from './config.js';
import { runScheduler, validateCronExpression, getUpcomingTasks, getTaskMetrics } from './scheduler.js';
import { getExecutionHistory } from './executor.js';
import { renderTasksTable, renderUpcomingTasksTable, renderExecutionLogs, renderDashboard } from './ui.js';
import { runInit } from './init.js';
import { Task } from './types.js';

const program = new Command();

program.name('cronito').description('Interactive task scheduler CLI').version('1.0.0');

// ============= INIT COMMAND =============
program
  .command('init')
  .description('Set up cronito: migrate legacy data and install the system cron entry')
  .action(async () => {
    try {
      console.log(chalk.bold.cyan('\n🔧 Initializing cronito\n'));

      const result = await runInit();

      if (result.migratedFromLegacy) {
        console.log(chalk.green(`✓ Migrated ${result.migratedTasks} task(s) from ${chalk.cyan('~/.mabl-scheduler')}`));
      }

      if (result.legacyCrontabRemoved) {
        console.log(chalk.green('✓ Replaced the old mabl-scheduler crontab entry'));
      }

      console.log(chalk.green('✓ Installed system cron entry:'));
      console.log(`  ${chalk.gray(result.crontabLine)}`);

      if (result.legacyConfigDir) {
        console.log(
          chalk.yellow(
            `\n⚠ Legacy data still present at ${result.legacyConfigDir} — safe to remove once you've confirmed cronito is working.`
          )
        );
      }

      console.log(chalk.bold.green('\n✓ cronito is ready. Try "cronito status".\n'));
    } catch (error) {
      console.error(chalk.red('Error initializing cronito:'), error);
      process.exit(1);
    }
  });

// ============= RUN COMMAND =============
program
  .command('run [taskId]')
  .description('Run scheduler (check and execute pending tasks) or run a specific task')
  .action(async (taskId: string | undefined) => {
    try {
      if (taskId) {
        // Run specific task immediately (force-run)
        const task = await getTask(taskId);
        if (!task) {
          console.error(chalk.red(`Task not found: ${taskId}`));
          process.exit(1);
        }

        if (!task.enabled) {
          console.error(chalk.red(`Task is disabled: ${task.name}`));
          process.exit(1);
        }

        console.log(chalk.cyan(`Running task: ${task.name}...`));
        const { executeCommand, logExecution } = await import('./executor.js');
        const startTime = Date.now();

        try {
          const result = await executeCommand(task.command, task.pwd);
          const duration = Date.now() - startTime;

          const log = {
            taskId: task.id,
            taskName: task.name,
            timestamp: new Date().toISOString(),
            status: result.status as 'success' | 'failure',
            duration,
            stdout: result.stdout,
            stderr: result.stderr,
            error: result.error,
          };

          await logExecution(log);

          if (result.status === 'success') {
            console.log(chalk.green(`✓ Task completed in ${duration}ms`));
            if (result.stdout) console.log(chalk.gray(result.stdout));
          } else {
            console.log(chalk.red(`✗ Task failed in ${duration}ms`));
            if (result.stderr) console.log(chalk.red(result.stderr));
          }
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : String(error);
          console.error(chalk.red(`✗ Error: ${errorMsg}`));
          process.exit(1);
        }
      } else {
        // Run all pending tasks (default behavior)
        await runScheduler();
      }
    } catch (error) {
      console.error(chalk.red('Error running scheduler:'), error);
      process.exit(1);
    }
  });

// ============= ADD COMMAND =============
program
  .command('add')
  .description('Add a new scheduled task')
  .action(async () => {
    try {
      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Task name:',
          validate: (val) => (val ? true : 'Task name is required'),
        },
        {
          type: 'input',
          name: 'command',
          message: 'Command to run:',
          validate: (val) => (val ? true : 'Command is required'),
        },
        {
          type: 'input',
          name: 'pwd',
          message: 'Working directory:',
          default: process.cwd(),
        },
        {
          type: 'list',
          name: 'cronPreset',
          message: 'When should it run?',
          choices: [
            { name: 'Every minute', value: '* * * * *' },
            { name: 'Every 5 minutes', value: '*/5 * * * *' },
            { name: 'Every 15 minutes', value: '*/15 * * * *' },
            { name: 'Every 30 minutes', value: '*/30 * * * *' },
            { name: 'Every hour', value: '0 * * * *' },
            { name: 'Daily at 9 AM', value: '0 9 * * *' },
            { name: 'Every Monday at 8 AM', value: '0 8 * * 1' },
            { name: 'Custom cron expression', value: 'custom' },
          ],
        },
        {
          type: 'input',
          name: 'cron',
          message: 'Enter cron expression (minute, hour, day, month, day-of-week):',
          when: (answers) => answers.cronPreset === 'custom',
          validate: (val) => {
            const result = validateCronExpression(val);
            return result.valid ? true : result.error || 'Invalid cron expression';
          },
        },
        {
          type: 'confirm',
          name: 'notifyOnFailure',
          message: 'Send a macOS notification if this task fails?',
          default: true,
        },
        {
          type: 'confirm',
          name: 'notifyOnSuccess',
          message: 'Send a macOS notification when this task succeeds?',
          default: false,
        },
      ]);

      const cron = answers.cronPreset === 'custom' ? answers.cron : answers.cronPreset;
      const task: Task = {
        id: uuidv4(),
        name: answers.name,
        command: answers.command,
        cron,
        pwd: answers.pwd,
        enabled: true,
        notifyOnFailure: answers.notifyOnFailure,
        notifyOnSuccess: answers.notifyOnSuccess,
        createdAt: new Date().toISOString(),
      };

      await addTask(task);
      console.log(chalk.green(`✓ Task "${task.name}" added with ID: ${chalk.cyan(task.id.slice(0, 8))}`));
    } catch (error) {
      console.error(chalk.red('Error adding task:'), error);
      process.exit(1);
    }
  });

// ============= LIST COMMAND =============
program
  .command('list')
  .description('List all scheduled tasks')
  .action(async () => {
    try {
      const tasks = await getAllTasks();
      if (tasks.length === 0) {
        console.log(chalk.yellow('No tasks scheduled. Use "cronito add" to create one.'));
        return;
      }
      renderTasksTable(tasks);
    } catch (error) {
      console.error(chalk.red('Error listing tasks:'), error);
      process.exit(1);
    }
  });

// ============= EDIT COMMAND =============
program
  .command('edit <taskId>')
  .description('Edit an existing task')
  .action(async (taskId: string) => {
    try {
      const task = await getTask(taskId);
      if (!task) {
        console.error(chalk.red(`Task not found: ${taskId}`));
        process.exit(1);
      }

      const answers = await inquirer.prompt([
        {
          type: 'input',
          name: 'name',
          message: 'Task name:',
          default: task.name,
        },
        {
          type: 'input',
          name: 'command',
          message: 'Command to run:',
          default: task.command,
        },
        {
          type: 'input',
          name: 'pwd',
          message: 'Working directory:',
          default: task.pwd,
        },
        {
          type: 'input',
          name: 'cron',
          message: 'Cron expression:',
          default: task.cron,
          validate: (val) => {
            const result = validateCronExpression(val);
            return result.valid ? true : result.error || 'Invalid cron expression';
          },
        },
        {
          type: 'confirm',
          name: 'notifyOnFailure',
          message: 'Send a macOS notification if this task fails?',
          default: task.notifyOnFailure !== false,
        },
        {
          type: 'confirm',
          name: 'notifyOnSuccess',
          message: 'Send a macOS notification when this task succeeds?',
          default: task.notifyOnSuccess === true,
        },
      ]);

      await updateTask(task.id, answers);
      console.log(chalk.green(`✓ Task "${answers.name}" updated`));
    } catch (error) {
      console.error(chalk.red('Error editing task:'), error);
      process.exit(1);
    }
  });

// ============= REMOVE COMMAND =============
program
  .command('remove <taskId>')
  .description('Remove a scheduled task')
  .action(async (taskId: string) => {
    try {
      const task = await getTask(taskId);
      if (!task) {
        console.error(chalk.red(`Task not found: ${taskId}`));
        process.exit(1);
      }

      const { confirm } = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Remove task "${task.name}"?`,
          default: false,
        },
      ]);

      if (confirm) {
        await removeTask(task.id);
        console.log(chalk.green(`✓ Task "${task.name}" removed`));
      } else {
        console.log(chalk.yellow('Cancelled'));
      }
    } catch (error) {
      console.error(chalk.red('Error removing task:'), error);
      process.exit(1);
    }
  });

// ============= LOGS COMMAND =============
program
  .command('logs [taskId]')
  .description('View execution logs')
  .option('-n, --number <count>', 'Number of logs to show', '20')
  .action(async (taskId: string | undefined, options) => {
    try {
      const limit = parseInt(options.number, 10);
      const logs = await getExecutionHistory(taskId, limit);

      if (logs.length === 0) {
        console.log(chalk.yellow('No execution logs found'));
        return;
      }

      renderExecutionLogs(logs);
    } catch (error) {
      console.error(chalk.red('Error fetching logs:'), error);
      process.exit(1);
    }
  });

// ============= STATUS COMMAND =============
program
  .command('status')
  .description('Show scheduler status and upcoming tasks')
  .action(async () => {
    try {
      const tasks = await getAllTasks();
      const upcomingTasks = await getUpcomingTasks(5);

      console.log(chalk.bold.cyan('\n📊 Scheduler Status\n'));
      console.log(`Total tasks: ${chalk.cyan(tasks.length)}`);
      console.log(
        `Enabled: ${chalk.green(tasks.filter((t) => t.enabled).length)} | Disabled: ${chalk.yellow(tasks.filter((t) => !t.enabled).length)}`
      );

      if (upcomingTasks.length > 0) {
        console.log(chalk.bold.cyan('\n⏰ Next Tasks to Run\n'));
        renderUpcomingTasksTable(upcomingTasks);
      }
    } catch (error) {
      console.error(chalk.red('Error getting status:'), error);
      process.exit(1);
    }
  });

// ============= DASHBOARD COMMAND =============
program
  .command('dashboard')
  .description('Show comprehensive scheduler dashboard with metrics')
  .action(async () => {
    try {
      const tasks = await getAllTasks();
      const logs = await getExecutionHistory(undefined, 1000);

      const metrics = await Promise.all(tasks.map((t) => getTaskMetrics(t.id, logs)));

      await renderDashboard(tasks, metrics, logs);
    } catch (error) {
      console.error(chalk.red('Error rendering dashboard:'), error);
      process.exit(1);
    }
  });

// ============= HEALTH CHECK COMMAND =============
program
  .command('health')
  .description('Check scheduler health and system status')
  .action(async () => {
    try {
      const tasks = await getAllTasks();
      const logs = await getExecutionHistory(undefined, 1000);

      console.log(chalk.bold.cyan('\n🏥 Scheduler Health Check\n'));

      let allHealthy = true;

      // Check 1: Config exists
      console.log('✓ Configuration file readable');

      // Check 2: System cron entry
      console.log(chalk.yellow('⚠ System cron entry: Run "crontab -l | grep cronito" to verify'));

      // Check 3: Tasks exist
      if (tasks.length === 0) {
        console.log(chalk.yellow('⚠ No tasks configured'));
        allHealthy = false;
      } else {
        console.log(`✓ ${tasks.length} task${tasks.length !== 1 ? 's' : ''} configured`);
      }

      // Check 4: Recent executions
      const recentLogs = logs.filter((l) => {
        const logTime = new Date(l.timestamp).getTime();
        const nowTime = new Date().getTime();
        return nowTime - logTime < 3600000; // last hour
      });

      if (recentLogs.length === 0) {
        console.log(chalk.yellow('⚠ No executions in the last hour'));
      } else {
        console.log(`✓ ${recentLogs.length} execution${recentLogs.length !== 1 ? 's' : ''} in the last hour`);
      }

      // Check 5: Failure rate
      const failureCount = logs.filter((l) => l.status === 'failure').length;
      const failureRate = logs.length === 0 ? 0 : (failureCount / logs.length) * 100;

      if (failureRate > 10) {
        console.log(chalk.red(`✗ High failure rate: ${failureRate.toFixed(1)}%`));
        allHealthy = false;
      } else {
        console.log(`✓ Low failure rate: ${failureRate.toFixed(1)}%`);
      }

      // Check 6: Stalled tasks
      const metrics = await Promise.all(tasks.map((t) => getTaskMetrics(t.id, logs)));
      const stalledCount = metrics.filter((m) => m.isStalled).length;

      if (stalledCount > 0) {
        console.log(chalk.red(`✗ ${stalledCount} task${stalledCount !== 1 ? 's' : ''} stalled`));
        allHealthy = false;
      } else {
        console.log(`✓ No stalled tasks`);
      }

      console.log();
      if (allHealthy) {
        console.log(chalk.green.bold('✓ All checks passed - scheduler is healthy!\n'));
      } else {
        console.log(chalk.yellow.bold('⚠ Some issues detected - run "cronito dashboard" for details\n'));
      }
    } catch (error) {
      console.error(chalk.red('Error checking health:'), error);
      process.exit(1);
    }
  });

// ============= ENABLE/DISABLE COMMANDS =============
program
  .command('enable <taskId>')
  .description('Enable a task')
  .action(async (taskId: string) => {
    try {
      const task = await getTask(taskId);
      if (!task) {
        console.error(chalk.red(`Task not found: ${taskId}`));
        process.exit(1);
      }
      await updateTask(task.id, { enabled: true });
      console.log(chalk.green(`✓ Task "${task.name}" enabled`));
    } catch (error) {
      console.error(chalk.red('Error enabling task:'), error);
      process.exit(1);
    }
  });

program
  .command('disable <taskId>')
  .description('Disable a task')
  .action(async (taskId: string) => {
    try {
      const task = await getTask(taskId);
      if (!task) {
        console.error(chalk.red(`Task not found: ${taskId}`));
        process.exit(1);
      }
      await updateTask(task.id, { enabled: false });
      console.log(chalk.yellow(`✓ Task "${task.name}" disabled`));
    } catch (error) {
      console.error(chalk.red('Error disabling task:'), error);
      process.exit(1);
    }
  });

// Parse and run. Wrapped in an async main (rather than top-level await) so the
// bundle can target CJS, which esbuild needs to shim Node's dynamic require()
// for dependencies like commander that aren't pure ESM.
async function main() {
  await initializeConfig();
  program.parse(process.argv);

  if (!process.argv.slice(2).length) {
    program.outputHelp();
  }
}

main().catch((error) => {
  console.error(chalk.red('Fatal error:'), error);
  process.exit(1);
});
