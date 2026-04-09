#!/usr/bin/env node

import { existsSync, readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkgPath = resolve(__dirname, '../package.json');
const versionMetaPath = resolve(__dirname, '../public/version.json');
const defaultDownloadUrl = 'https://github.com/aleksandrd836-cyber/Nash-Chat/releases/latest';
const defaultNotes = 'AI Audio Release - Интеллектуальное шумоподавление RNNoise для чистейшего голоса.';

function buildVersionNotes(version, existingNotes = '') {
  const trimmedNotes = existingNotes.trim();
  const suffix = trimmedNotes
    ? trimmedNotes.replace(/^V\d+\.\d+\.\d+:\s*/i, '')
    : defaultNotes;

  return `V${version}: ${suffix}`;
}

export function syncVersionMetadata() {
  const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));

  const currentMeta = existsSync(versionMetaPath)
    ? JSON.parse(readFileSync(versionMetaPath, 'utf-8'))
    : {};

  const nextMeta = {
    version: pkg.version,
    notes: buildVersionNotes(pkg.version, currentMeta.notes),
    downloadUrl: currentMeta.downloadUrl || defaultDownloadUrl,
  };

  writeFileSync(versionMetaPath, JSON.stringify(nextMeta, null, 2) + '\n');
  return nextMeta;
}

const isDirectRun = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirectRun) {
  const metadata = syncVersionMetadata();
  console.log(`✅ Версия синхронизирована: public/version.json → ${metadata.version}`);
}
