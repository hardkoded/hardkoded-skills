import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { spawnSync } from 'child_process';
import { Config } from './types.js';
import { getHistoryFile, initializeConfig, loadConfig, saveConfig } from './config.js';

const LEGACY_CONFIG_DIR = path.join(os.homedir(), '.mabl-scheduler');
const CRON_MARKER = 'cronito';
const LEGACY_CRON_MARKER = 'mabl-scheduler';

export interface InitResult {
  migratedTasks: number;
  migratedFromLegacy: boolean;
  crontabInstalled: boolean;
  crontabLine: string;
  legacyCrontabRemoved: boolean;
  legacyConfigDir: string | null;
}

async function migrateLegacyConfig(): Promise<{ migratedTasks: number; migratedFromLegacy: boolean }> {
  await initializeConfig();
  const current = await loadConfig();

  const legacyConfigFile = path.join(LEGACY_CONFIG_DIR, 'config.json');
  if (current.tasks.length > 0 || !fs.existsSync(legacyConfigFile)) {
    return { migratedTasks: 0, migratedFromLegacy: false };
  }

  const legacyConfig = fs.readJsonSync(legacyConfigFile) as Config;
  await saveConfig(legacyConfig);

  const legacyHistoryFile = path.join(LEGACY_CONFIG_DIR, 'history.jsonl');
  if (fs.existsSync(legacyHistoryFile)) {
    fs.copyFileSync(legacyHistoryFile, getHistoryFile());
  }

  return { migratedTasks: legacyConfig.tasks.length, migratedFromLegacy: true };
}

function readCrontab(): string {
  const result = spawnSync('crontab', ['-l'], { encoding: 'utf-8' });
  // Non-zero exit typically means no crontab installed yet for this user.
  return result.status === 0 ? result.stdout : '';
}

function installCrontabEntry(distFile: string): { installed: boolean; line: string; removedLegacy: boolean } {
  const line = `* * * * * ${process.execPath} ${distFile} run`;
  const existing = readCrontab();
  const lines = existing.split('\n');

  const removedLegacy = lines.some((l) => l.includes(LEGACY_CRON_MARKER));
  const kept = lines.filter(
    (l) => !l.includes(LEGACY_CRON_MARKER) && !l.includes(`# ${CRON_MARKER}:`) && l.trim() !== line.trim()
  );

  // Drop trailing blank lines before appending our block.
  while (kept.length > 0 && kept[kept.length - 1].trim() === '') {
    kept.pop();
  }

  kept.push(`# ${CRON_MARKER}: runs task scheduler every minute`, line, '');

  const result = spawnSync('crontab', ['-'], { input: kept.join('\n'), encoding: 'utf-8' });
  if (result.status !== 0) {
    throw new Error(`Failed to install crontab entry: ${result.stderr || result.error}`);
  }

  return { installed: true, line, removedLegacy };
}

export async function runInit(): Promise<InitResult> {
  const { migratedTasks, migratedFromLegacy } = await migrateLegacyConfig();

  // process.argv[1] is the absolute path to the running dist/cronito.js file —
  // stable regardless of where this skill directory is installed.
  const distFile = path.resolve(process.argv[1]);
  const { installed, line, removedLegacy } = installCrontabEntry(distFile);

  return {
    migratedTasks,
    migratedFromLegacy,
    crontabInstalled: installed,
    crontabLine: line,
    legacyCrontabRemoved: removedLegacy,
    legacyConfigDir: fs.existsSync(LEGACY_CONFIG_DIR) ? LEGACY_CONFIG_DIR : null,
  };
}
