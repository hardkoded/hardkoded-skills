import fs from 'fs-extra';
import path from 'path';
import os from 'os';
import { Config, Task } from './types.js';

const CONFIG_DIR = path.join(os.homedir(), '.cronito');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');
const HISTORY_FILE = path.join(CONFIG_DIR, 'history.jsonl');
const STATE_FILE = path.join(CONFIG_DIR, 'state.json');

export async function initializeConfig() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }

  if (!fs.existsSync(CONFIG_FILE)) {
    const defaultConfig: Config = {
      version: '1.0.0',
      tasks: [],
    };
    fs.writeJsonSync(CONFIG_FILE, defaultConfig, { spaces: 2 });
  }
}

export async function loadConfig(): Promise<Config> {
  await initializeConfig();
  if (!fs.existsSync(CONFIG_FILE)) {
    return { version: '1.0.0', tasks: [] };
  }
  return fs.readJsonSync(CONFIG_FILE) as Config;
}

export async function saveConfig(config: Config): Promise<void> {
  await initializeConfig();
  fs.writeJsonSync(CONFIG_FILE, config, { spaces: 2 });
}

export async function addTask(task: Task): Promise<void> {
  const config = await loadConfig();
  config.tasks.push(task);
  await saveConfig(config);
}

export async function updateTask(id: string, updates: Partial<Task>): Promise<void> {
  const config = await loadConfig();
  const task = config.tasks.find((t) => t.id === id);
  if (!task) throw new Error(`Task not found: ${id}`);
  Object.assign(task, updates);
  await saveConfig(config);
}

export async function removeTask(id: string): Promise<void> {
  const config = await loadConfig();
  config.tasks = config.tasks.filter((t) => t.id !== id);
  await saveConfig(config);
}

export async function getTask(id: string): Promise<Task | undefined> {
  const config = await loadConfig();
  return config.tasks.find((t) => t.id === id);
}

export async function getAllTasks(): Promise<Task[]> {
  const config = await loadConfig();
  return config.tasks;
}

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigFile(): string {
  return CONFIG_FILE;
}

export function getHistoryFile(): string {
  return HISTORY_FILE;
}

export function getStateFile(): string {
  return STATE_FILE;
}
