/**
 * Relatório transitório da verificação online.
 *
 * O JSON em `test/artifacts/online/<run-id>/result.json` contém apenas metadados permitidos: nada de
 * streams completos, URLs, corpos de resposta, cabeçalhos ou credenciais. O saneamento já acontece na
 * classificação; este módulo nunca recebe os objetos de stream.
 */

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { sanitizeText } from './sanitize.mjs';

/**
 * Cria o ID de uma rodada, seguro para nome de pasta e único.
 *
 * @param {{ providerId: string, seed: string, now?: Date }} options - Provedor, semente e instante.
 * @returns {string} ID no formato `<data>-<provedor>-<semente>-<aleatório>`.
 * @example
 * createRunId({ providerId: 'betor', seed: 'abc', now: new Date('2026-11-12T12:00:00Z') });
 * // '2026-11-12T12-00-00-000Z-betor-abc-1a2b'
 */
export function createRunId({ providerId, seed, now = new Date() }) {
  const stamp = now.toISOString().replace(/[:.]/g, '-');
  const random = randomBytes(2).toString('hex');
  return `${stamp}-${providerId}-${seed.slice(0, 8)}-${random}`;
}

/**
 * Monta o relatório permitido.
 *
 * @param {{ runId: string, generatedAt?: string, provider: object, identity: object, selection: object, cases: object[], summary: object, preparationFailure?: string|null }} options - Dados da rodada.
 * @returns {object} Relatório sanitizado.
 * @example
 * const report = buildReport({ runId, provider, identity, selection, cases, summary });
 */
export function buildReport({
  runId,
  generatedAt = new Date().toISOString(),
  provider,
  identity,
  selection,
  cases,
  summary,
  preparationFailure = null,
}) {
  const report = {
    schemaVersion: 1,
    runId,
    generatedAt,
    provider: {
      id: provider.id,
      name: provider.name,
      version: provider.version,
      enabled: provider.enabled !== false,
      supportedTypes: provider.supportedTypes.slice(),
      packageHash: identity.packageHash,
    },
    identity: {
      algorithm: identity.algorithm,
      protocolVersion: identity.protocolVersion,
      hash: identity.hash,
      packageHash: identity.packageHash,
      supportedTypes: identity.supportedTypes,
      profile: identity.profile,
      catalogs: identity.catalogs,
    },
    selection: {
      seed: selection.seed,
      algorithm: selection.algorithm,
      exclusiveTag: selection.exclusiveTag,
      types: Object.fromEntries(
        Object.entries(selection.types).map(([mediaType, sample]) => [
          mediaType,
          {
            candidates: sample.candidates,
            titles: sample.titles.map((title) => ({
              tmdbId: title.tmdbId,
              title: title.title,
              year: title.year,
              tags: title.tags,
              ...(mediaType === 'tv' ? { season: title.season, episode: title.episode } : {}),
            })),
          },
        ]),
      ),
    },
    summary,
    cases: cases.map((item) => ({
      mediaType: item.mediaType,
      tmdbId: item.tmdbId,
      title: item.title,
      year: item.year,
      tags: item.tags,
      ...(item.mediaType === 'tv' ? { season: item.season, episode: item.episode } : {}),
      outcome: item.outcome,
      streamsReturned: item.streamsReturned,
      usableStreams: item.usableStreams,
      reason: item.reason === null ? null : sanitizeText(item.reason),
      warnings: Array.isArray(item.warnings) ? item.warnings.map((message) => sanitizeText(message)) : [],
    })),
  };
  if (preparationFailure) {
    report.preparationFailure = sanitizeText(preparationFailure);
  }
  return report;
}

/**
 * Grava o relatório em `test/artifacts/online/<run-id>/result.json`.
 *
 * @param {{ artifactsDir: string, report: object }} options - Diretório raiz de artefatos e relatório.
 * @returns {string} Caminho absoluto do arquivo gravado.
 * @throws {Error} Se o diretório ou o arquivo não puderem ser criados.
 * @example
 * const file = writeReport({ artifactsDir: 'test/artifacts/online', report });
 */
export function writeReport({ artifactsDir, report }) {
  const runDir = path.join(artifactsDir, report.runId);
  fs.mkdirSync(runDir, { recursive: true });
  const file = path.join(runDir, 'result.json');
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  return file;
}

/**
 * Formata o resumo do terminal.
 *
 * @param {object} report - Relatório da rodada.
 * @param {string} [reportPath] - Caminho do JSON gravado.
 * @returns {string} Texto com status, indicativos e totais por tipo.
 * @example
 * console.log(formatSummary(report, reportPath));
 */
export function formatSummary(report, reportPath) {
  const lines = [];
  lines.push(`Provedor: ${report.provider.name} (${report.provider.id}) · pacote ${report.provider.version}`);
  if (report.preparationFailure) {
    lines.push(`Status: ${report.summary.status}`);
    lines.push(`Preparação: ${report.preparationFailure}`);
  } else {
    lines.push(`Status: ${report.summary.status}`);
    for (const indicator of report.summary.indicators) {
      const mediaType = indicator.split(' ')[0];
      const type = report.summary.types[mediaType];
      lines.push(
        `${indicator}: ${type.resolved} resolvido(s), ${type.empty} sem resultado, ${type.failure} falha(s), ${type.inconclusive} inconclusivo(s)`,
      );
    }
  }
  if (reportPath) lines.push(`Relatório: ${reportPath}`);
  return lines.join('\n');
}
