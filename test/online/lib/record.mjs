/**
 * Registro da rodada online em `providers.md`.
 *
 * A tabela resume a última evidência; o bloco delimitado da seção do provedor guarda apenas a
 * rodada mais recente, sem hashes. A escrita é atômica e só altera a linha e o bloco do provedor
 * selecionado.
 */

import { randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { STATUSES } from './classify.mjs';
import { sanitizeText } from './sanitize.mjs';

const START_MARKER = '<!-- online-verification:start -->';
const END_MARKER = '<!-- online-verification:end -->';
const ROUND_HEADER = /^(\d+)\. \*\*([^*]+)\*\* · ID `([^`]+)` · \*\*(Estável|Parcial|Instável|Não verificado|Desativado)\*\* · pacote (\S+) · perfil `([^`]+)` · catálogos `movie@([^`]+)`, `tv@([^`]+)` · semente `([^`]+)` · algoritmo `([^`]+)`/;
const CASE_LINE = /^\s{3}(\d+)\. `(movie|tv)` `([^`]+)` · (.+?) · (?:S(\d+)E(\d+) · )?\*\*(Resolvido|Sem resultado|Falha|Inconclusivo)\*\* · (\d+)\/(\d+) streams aproveitáveis(?: · Motivo: (.*))?$/;
const STATUS_EMOJI = Object.freeze({
  [STATUSES.STABLE]: '🟢',
  [STATUSES.PARTIAL]: '🔵',
  [STATUSES.UNSTABLE]: '🔴',
  [STATUSES.UNVERIFIED]: '🟠',
  [STATUSES.DISABLED]: '⚫',
});

/**
 * Formata um status para exibição na tabela e na seção.
 *
 * @param {string} status - Status público sem emoji.
 * @returns {string} Status com indicador visual.
 * @throws {Error} Se o status não for conhecido.
 * @example
 * renderStatus('Estável'); // '🟢 Estável'
 */
export function renderStatus(status) {
  const emoji = STATUS_EMOJI[status];
  if (!emoji) throw new Error(`status desconhecido: "${status}"`);
  return `${emoji} ${status}`;
}

/**
 * Remove o indicador visual de um status exibido.
 *
 * @param {string} value - Texto do status, com ou sem emoji.
 * @returns {string} Status público sem emoji.
 * @throws {Error} Se o status não for conhecido.
 * @example
 * parseStatus('🔴 Instável'); // 'Instável'
 */
export function parseStatus(value) {
  const text = String(value).trim();
  const match = text.match(/^(?:🟢|🔵|🔴|🟠|⚫)\s+(.+)$/u);
  const status = match ? match[1].trim() : text;
  if (!Object.values(STATUSES).includes(status)) {
    throw new Error(`status inválido: "${value}"`);
  }
  return status;
}

/**
 * Registra a rodada mais recente e atualiza a linha da tabela e o bloco do provedor.
 *
 * @param {{ rootDir: string, report: object }} options - Raiz do repositório e relatório da rodada.
 * @returns {{ changed: boolean, status: string, file: string, date: string }} Resultado.
 * @throws {Error} Se o provedor, a seção ou o bloco estiverem ausentes ou inconsistentes.
 * @example
 * const result = recordRun({ rootDir: 'C:/repo', report });
 * // result.status === 'Estável'
 */
export function recordRun({ rootDir, report }) {
  const file = path.join(rootDir, 'providers.md');
  const original = fs.readFileSync(file, 'utf8');
  const row = findRow(original, report.provider.id);
  const bounds = findSection(original, report.provider.name);
  let section = original.slice(bounds.start, bounds.end);

  const status = report.provider.enabled === false ? STATUSES.DISABLED : report.summary.status;
  const date = report.generatedAt.slice(0, 10);
  const block = findBlock(section);
  if (block) {
    const rounds = parseRounds(block.content);
    const existing = rounds.find((round) => round.id === report.runId);
    if (existing) {
      if (!roundsEquivalent(existing, report)) {
        throw new Error(`rodada "${report.runId}" já existe com conteúdo divergente`);
      }
      return { changed: false, status, file, date };
    }
  }

  const rendered = renderRound(report, 1);
  if (block) {
    const content = `\n### Verificações online\n\n${rendered}\n`;
    section = `${section.slice(0, block.start + START_MARKER.length)}${content}${section.slice(block.end)}`;
  } else {
    const insertion = section.replace(/\s*$/, '');
    section = `${insertion}\n\n${START_MARKER}\n### Verificações online\n\n${rendered}\n${END_MARKER}\n\n`;
  }

  section = replaceSectionStatus(section, status);
  const rowLine = renderRow(row, status, date);
  let next = original.slice(0, bounds.start) + section + original.slice(bounds.end);
  next = replaceRow(next, row.line, rowLine);
  if (next === original) {
    return { changed: false, status, file, date };
  }
  atomicWrite(file, next);
  return { changed: true, status, file, date };
}

/**
 * Lê as rodadas de um documento Markdown, sem gravá-lo.
 *
 * @param {string} markdown - Conteúdo completo de `providers.md`.
 * @returns {Map<string, object[]>} Rodadas por ID do provedor.
 * @example
 * const history = parseHistory(fs.readFileSync('providers.md', 'utf8'));
 */
export function parseHistory(markdown) {
  const result = new Map();
  const rows = [...markdown.matchAll(/^\|\s*\[([^\]]+)\]\(#[^)]+\)\s*\|\s*`([a-z0-9-]+)`\s*\|/gm)]
    .map((match) => ({ name: match[1], id: match[2] }));
  const headings = [...markdown.matchAll(/^## (.+)$/gm)];
  for (const [index, heading] of headings.entries()) {
    const start = heading.index;
    const end = index + 1 < headings.length ? headings[index + 1].index : markdown.length;
    const section = markdown.slice(start, end);
    const row = rows.find((item) => item.name === heading[1]);
    const block = findBlock(section);
    if (!row || !block) continue;
    result.set(row.id, parseRounds(block.content));
  }
  return result;
}

/**
 * Renderiza a rodada no formato estável do bloco.
 *
 * @param {object} report - Relatório da rodada.
 * @param {number} number - Número do item na lista, sempre 1 no resumo atual.
 * @returns {string} Bloco da rodada, sem marcadores.
 * @example
 * renderRound(report, 1);
 */
export function renderRound(report, number) {
  const profile = report.identity.profile.exclusiveTag === null ? 'generalista' : report.identity.profile.exclusiveTag;
  const catalogs = report.identity.catalogs;
  const lines = [
    `${number}. **${report.generatedAt}** · ID \`${report.runId}\` · **${report.summary.status}** · pacote ${report.provider.version} · perfil \`${profile}\` · catálogos \`movie@${catalogs.movie.revision}\`, \`tv@${catalogs.tv.revision}\` · semente \`${report.selection.seed}\` · algoritmo \`${report.selection.algorithm}\``,
  ];
  if (report.preparationFailure) lines.push(`   Preparação: ${sanitizeText(report.preparationFailure)}`);
  report.cases.forEach((item, index) => {
    const coords = item.mediaType === 'tv'
      ? ` · S${String(item.season).padStart(2, '0')}E${String(item.episode).padStart(2, '0')}`
      : '';
    const reason = item.reason ? ` · Motivo: ${sanitizeText(item.reason)}` : '';
    lines.push(
      `   ${index + 1}. \`${item.mediaType}\` \`${item.tmdbId}\` · ${item.title} (${item.year})${coords} · **${item.outcome}** · ${item.usableStreams}/${item.streamsReturned} streams aproveitáveis${reason}`,
    );
  });
  return lines.join('\n');
}

/**
 * Extrai as rodadas de um bloco.
 * @param {string} content - Conteúdo entre os marcadores.
 * @returns {object[]} Rodadas.
 * @throws {Error} Se uma linha de rodada ou caso estiver malformada.
 */
function parseRounds(content) {
  const rounds = [];
  const headerMatches = [...content.matchAll(new RegExp(ROUND_HEADER.source, 'gm'))];
  for (const [index, match] of headerMatches.entries()) {
    const start = match.index;
    const end = index + 1 < headerMatches.length ? headerMatches[index + 1].index : content.length;
    const raw = content.slice(start, end);
    const header = match;
    const cases = [];
    const caseMatches = [...raw.matchAll(new RegExp(CASE_LINE.source, 'gm'))];
    for (const item of caseMatches) {
      cases.push({
        number: Number(item[1]),
        mediaType: item[2],
        tmdbId: item[3],
        title: item[4],
        season: item[5] ? Number(item[5]) : null,
        episode: item[6] ? Number(item[6]) : null,
        outcome: item[7],
        usableStreams: Number(item[8]),
        streamsReturned: Number(item[9]),
        reason: item[10] || null,
      });
    }
    const preparation = raw.match(/^\s{3}Preparação: (.*)$/m);
    rounds.push({
      number: Number(header[1]),
      raw,
      date: header[2],
      id: header[3],
      status: header[4],
      packageVersion: header[5],
      profile: header[6],
      catalogs: {
        movie: { revision: header[7] },
        tv: { revision: header[8] },
      },
      seed: header[9],
      algorithm: header[10],
      preparationFailure: preparation ? preparation[1] : null,
      cases,
    });
  }
  return rounds;
}

/**
 * Confere se a rodada existente representa o mesmo conteúdo do relatório.
 * @param {object} round - Rodada parseada.
 * @param {object} report - Relatório novo.
 * @returns {boolean} True quando todos os dados públicos coincidem.
 */
function roundsEquivalent(round, report) {
  const expectedCases = report.cases.map((item, index) => ({
    number: index + 1,
    mediaType: item.mediaType,
    tmdbId: item.tmdbId,
    title: `${item.title} (${item.year})`,
    season: item.mediaType === 'tv' ? item.season : null,
    episode: item.mediaType === 'tv' ? item.episode : null,
    outcome: item.outcome,
    usableStreams: item.usableStreams,
    streamsReturned: item.streamsReturned,
    reason: item.reason || null,
  }));
  return round.date === report.generatedAt
    && round.status === report.summary.status
    && round.packageVersion === report.provider.version
    && round.profile === (report.identity.profile.exclusiveTag === null ? 'generalista' : report.identity.profile.exclusiveTag)
    && round.catalogs.movie.revision === report.identity.catalogs.movie.revision
    && round.catalogs.tv.revision === report.identity.catalogs.tv.revision
    && round.seed === report.selection.seed
    && round.algorithm === report.selection.algorithm
    && round.preparationFailure === (report.preparationFailure || null)
    && JSON.stringify(round.cases) === JSON.stringify(expectedCases);
}

/**
 * Localiza a linha de um provedor na tabela.
 * @param {string} markdown - Documento.
 * @param {string} providerId - ID do provedor.
 * @returns {{ line: string, name: string, anchor: string, id: string, types: string, format: string }} Linha e partes.
 * @throws {Error} Se a linha não existir.
 */
function findRow(markdown, providerId) {
  for (const line of markdown.split('\n')) {
    const match = line.match(/^\|\s*\[([^\]]+)\]\(#([^)]+)\)\s*\|\s*`([a-z0-9-]+)`\s*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|\s*$/);
    if (match && match[3] === providerId) {
      return {
        line,
        name: match[1],
        anchor: match[2],
        id: match[3],
        types: match[4].trim(),
        format: match[5].trim(),
      };
    }
  }
  throw new Error(`provedor "${providerId}" não está na tabela de providers.md`);
}

/**
 * Localiza os limites de uma seção `## <nome>`.
 * @param {string} markdown - Documento.
 * @param {string} name - Nome do provedor.
 * @returns {{ start: number, end: number }} Posições.
 * @throws {Error} Se a seção não existir.
 */
function findSection(markdown, name) {
  const start = markdown.indexOf(`## ${name}\n`);
  if (start === -1) throw new Error(`seção "## ${name}" ausente em providers.md`);
  const next = markdown.indexOf('\n## ', start + 3);
  return { start, end: next === -1 ? markdown.length : next + 1 };
}

/**
 * Localiza o bloco delimitado dentro de uma seção.
 * @param {string} section - Conteúdo da seção.
 * @returns {{ start: number, end: number, content: string }|null} Bloco ou null.
 * @throws {Error} Se houver marcador solto.
 */
function findBlock(section) {
  const start = section.indexOf(START_MARKER);
  const end = section.indexOf(END_MARKER);
  if (start === -1 && end === -1) return null;
  if (start === -1 || end === -1 || end < start) {
    throw new Error('bloco de verificação online com marcadores incompletos');
  }
  return { start, end, content: section.slice(start + START_MARKER.length, end) };
}

/**
 * Renderiza a linha da tabela com o novo status e a data.
 * @param {object} row - Linha original.
 * @param {string} status - Status público.
 * @param {string} date - Data da última verificação em AAAA-MM-DD.
 * @returns {string} Linha completa.
 */
function renderRow(row, status, date) {
  return `| [${row.name}](#${row.anchor}) | \`${row.id}\` | ${row.types} | ${row.format} | ${renderStatus(status)} | ${date} |`;
}

/**
 * Substitui a linha original pela nova, sem tocar em outras linhas.
 * @param {string} markdown - Documento.
 * @param {string} oldLine - Linha original.
 * @param {string} newLine - Linha nova.
 * @returns {string} Documento atualizado.
 */
function replaceRow(markdown, oldLine, newLine) {
  if (!markdown.includes(oldLine)) throw new Error('linha da tabela mudou durante o registro');
  return markdown.replace(oldLine, newLine);
}

/**
 * Troca o status da seção do provedor, preservando o indicador visual.
 * @param {string} section - Conteúdo da seção.
 * @param {string} status - Status novo.
 * @returns {string} Seção atualizada.
 * @throws {Error} Se a linha de status não existir.
 */
function replaceSectionStatus(section, status) {
  const pattern = /\*\*Status: [^*]+\.\*\*/;
  if (!pattern.test(section)) throw new Error('seção do provedor sem "**Status:**"');
  return section.replace(pattern, `**Status: ${renderStatus(status)}.**`);
}

/**
 * Grava o documento de forma atômica.
 * @param {string} file - Caminho final.
 * @param {string} content - Conteúdo.
 * @returns {void}
 * @throws {Error} Se a gravação ou a troca falharem.
 */
function atomicWrite(file, content) {
  const temp = path.join(path.dirname(file), `.providers.${process.pid}.${randomBytes(4).toString('hex')}.tmp`);
  try {
    fs.writeFileSync(temp, content, 'utf8');
    renameWithRetry(temp, file);
  } catch (error) {
    fs.rmSync(temp, { force: true });
    throw new Error(`falha ao gravar providers.md de forma atômica: ${error.message}`, { cause: error });
  }
}

/**
 * Troca o temporário pelo arquivo final, repetindo em bloqueios transitórios do Windows.
 * @param {string} temp - Arquivo temporário.
 * @param {string} file - Arquivo final.
 * @returns {void}
 * @throws {Error} Se a troca continuar bloqueada após as tentativas.
 */
function renameWithRetry(temp, file) {
  const retryable = new Set(['EPERM', 'EACCES', 'EBUSY']);
  for (let attempt = 0; attempt < 10; attempt += 1) {
    try {
      fs.renameSync(temp, file);
      return;
    } catch (error) {
      if (!retryable.has(error.code) || attempt === 9) throw error;
      sleepSync(10 * (attempt + 1));
    }
  }
}

/**
 * Espera síncrona curta, sem depender de timers assíncronos.
 * @param {number} milliseconds - Tempo de espera.
 * @returns {void}
 */
function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}
