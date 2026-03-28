#!/usr/bin/env node
/**
 * Автоматически увеличивает patch-версию в package.json перед каждым коммитом.
 * Запускается через git pre-commit хук.
 */

import { readFileSync, writeFileSync } from 'fs';
import { execSync } from 'child_process';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, '../package.json');

const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
const [major, minor, patch] = pkg.version.split('.').map(Number);
pkg.version = `${major}.${minor}.${patch + 1}`;

writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

console.log(`✅ Версия обновлена: ${major}.${minor}.${patch} → ${pkg.version}`);

// Добавляем обновлённый package.json в текущий коммит
execSync('git add package.json', { stdio: 'inherit' });
