#!/usr/bin/env node

import { execSync } from 'child_process';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

const sessionMemoryPath = resolve(repoRoot, 'SESSION_MEMORY.md');
const handoffPath = resolve(repoRoot, 'AI_HANDOFF.md');

const memoryFiles = new Set([
  'AI_CONTEXT_INDEX.md',
  'ARCHITECTURE_STATE.md',
  'VOICE_SYSTEM_STATE.md',
  'SESSION_MEMORY.md',
  'AI_HANDOFF.md',
  'ANTIGRAVITY_NOTEBOOK_UPDATE_2026-04-09.md',
]);

function run(command) {
  return execSync(command, {
    cwd: repoRoot,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function getStagedFiles() {
  const output = run('git diff --cached --name-only --diff-filter=ACMR');
  if (!output) return [];

  return output
    .split(/\r?\n/)
    .map((value) => value.trim())
    .filter(Boolean)
    .filter((file) => !memoryFiles.has(file));
}

function formatTimestamp(date = new Date()) {
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function appendSessionMemory(files) {
  if (!existsSync(sessionMemoryPath)) return;

  const original = readFileSync(sessionMemoryPath, 'utf-8').replace(/\s+$/, '');
  const timestamp = formatTimestamp();
  const entry = [
    '',
    `### Auto Log — ${timestamp}`,
    '- Автоматически записано git hook перед коммитом.',
    '- Изменённые файлы:',
    ...files.map((file) => `  - \`${file}\``),
  ].join('\n');

  if (original.includes(entry)) return;
  writeFileSync(sessionMemoryPath, `${original}\n${entry}\n`, 'utf-8');
}

function updateHandoff(files) {
  if (!existsSync(handoffPath)) return;

  const startMarker = '<!-- AUTO-LAST-UPDATE:START -->';
  const endMarker = '<!-- AUTO-LAST-UPDATE:END -->';
  const original = readFileSync(handoffPath, 'utf-8').replace(/\r\n/g, '\n');
  const timestamp = formatTimestamp();

  const autoBlock = [
    startMarker,
    '## Last Auto Update',
    `- Время: \`${timestamp}\``,
    '- Последние staged-файлы перед коммитом:',
    ...files.map((file) => `  - \`${file}\``),
    endMarker,
  ].join('\n');

  let next;
  if (original.includes(startMarker) && original.includes(endMarker)) {
    next = original.replace(
      new RegExp(`${startMarker}[\\s\\S]*?${endMarker}`),
      autoBlock
    );
  } else {
    next = `${original.trimEnd()}\n\n${autoBlock}\n`;
  }

  writeFileSync(handoffPath, next, 'utf-8');
}

function stageMemoryFiles() {
  run('git add SESSION_MEMORY.md AI_HANDOFF.md');
}

function main() {
  const stagedFiles = getStagedFiles();
  if (stagedFiles.length === 0) {
    console.log('ℹ️ AI memory: нет пользовательских staged-файлов, пропускаю авто-обновление.');
    return;
  }

  appendSessionMemory(stagedFiles);
  updateHandoff(stagedFiles);
  stageMemoryFiles();

  console.log(`🧠 AI memory updated for ${stagedFiles.length} file(s).`);
}

main();
