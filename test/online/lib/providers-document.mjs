/**
 * Conferência documental de `providers.md`.
 *
 * Usa somente os dados versionados: manifest, catálogos, perfis e o próprio Markdown. A suíte que
 * chama esta função não executa rede e não cria evidência pública.
 */

import { resolveProfile } from './catalog.mjs';
import { aggregateProvider, STATUSES } from './classify.mjs';
import { parseHistory, parseStatus, renderStatus } from './record.mjs';

const STATUS_VALUES = Object.values(STATUSES);
const ROW_PATTERN = /^\|\s*\[([^\]]+)\]\(#([^)]+)\)\s*\|\s*`([a-z0-9-]+)`\s*\|([^|]*)\|([^|]*)\|([^|]*)\|([^|]*)\|\s*$/;
const START_MARKER = '<!-- online-verification:start -->';
const END_MARKER = '<!-- online-verification:end -->';
const FORBIDDEN = /\b(?:https?|magnet|torrent):\/\/|(?:api[_-]?key|token|secret|password|authorization|cookie|signature|sig|expires)=|\b[a-f0-9]{64}\b/i;

/**
 * Valida a tabela, as seções e a última rodada contra o manifest e os catálogos atuais.
 *
 * @param {{ markdown: string, manifest: object, catalogs: { movie: object, tv: object }, profiles: object }} options - Documento e fontes de verdade.
 * @returns {{ rows: object[], history: Map<string, object[]>, statuses: Record<string, string> }} Dados lidos.
 * @throws {Error} Se houver divergência de linha, status, seção, rodada ou conteúdo proibido.
 * @example
 * validateProvidersDocument({ markdown, manifest, catalogs, profiles });
 */
export function validateProvidersDocument({ markdown, manifest, catalogs, profiles }) {
  const rows = [...markdown.matchAll(new RegExp(ROW_PATTERN.source, 'gm'))].map((match) => ({
    name: match[1],
    anchor: match[2],
    id: match[3],
    types: match[4].trim(),
    format: match[5].trim(),
    statusDisplay: match[6].trim(),
    status: parseStatus(match[6]),
    lastCell: match[7].trim(),
  }));
  const manifestIds = manifest.scrapers.map((scraper) => scraper.id).sort();
  const rowIds = rows.map((row) => row.id).sort();
  if (JSON.stringify(rowIds) !== JSON.stringify(manifestIds)) {
    throw new Error(`tabela de providers.md diverge do manifest: ${rowIds.join(', ')}`);
  }
  if (FORBIDDEN.test(markdown.split('\n').filter((line) => !line.startsWith('|')).join('\n'))) {
    throw new Error('providers.md contém URL, credencial ou hash não permitido no resumo público');
  }

  const history = parseHistory(markdown);
  const statuses = {};
  for (const scraper of manifest.scrapers) {
    const row = rows.find((item) => item.id === scraper.id);
    if (!row) throw new Error(`provedor "${scraper.id}" ausente da tabela`);
    if (row.name !== scraper.name) {
      throw new Error(`nome de "${scraper.id}" diverge do manifest: "${row.name}"`);
    }
    if (!STATUS_VALUES.includes(row.status)) {
      throw new Error(`status "${row.status}" de "${scraper.id}" fora de ${STATUS_VALUES.join(', ')}`);
    }

    const section = extractSection(markdown, scraper.name);
    if ((section.match(new RegExp(START_MARKER, 'g')) || []).length > 1
      || (section.match(new RegExp(END_MARKER, 'g')) || []).length > 1) {
      throw new Error(`seção de "${scraper.id}" tem mais de um bloco de verificação`);
    }
    const sectionStatus = section.match(/\*\*Status: ([^*]+)\.\*\*/);
    if (!sectionStatus) throw new Error(`seção de "${scraper.id}" sem "**Status: <status>.**"`);
    const sectionStatusValue = parseStatus(sectionStatus[1]);

    const rounds = history.get(scraper.id) || [];
    if (rounds.length > 1) {
      throw new Error(`seção de "${scraper.id}" tem ${rounds.length} rodadas; mantenha apenas a última`);
    }
    let expectedStatus = scraper.enabled === false ? STATUSES.DISABLED : STATUSES.UNVERIFIED;
    let expectedDate = '—';
    if (rounds.length === 1) {
      const round = rounds[0];
      validateRound(round, scraper.id);
      validateRoundStatus(round, scraper);
      expectedDate = round.date.slice(0, 10);
      const current = isCurrentRound(round, scraper, profiles, catalogs);
      if (scraper.enabled === false) expectedStatus = STATUSES.DISABLED;
      else if (current) expectedStatus = round.status;
    }

    const expectedDisplay = renderStatus(expectedStatus);
    if (row.statusDisplay !== expectedDisplay) {
      throw new Error(`status de "${scraper.id}" na tabela é "${row.statusDisplay}", esperado "${expectedDisplay}"`);
    }
    if (row.status !== expectedStatus) {
      throw new Error(`status de "${scraper.id}" na tabela é "${row.status}", esperado "${expectedStatus}"`);
    }
    if (row.lastCell !== expectedDate) {
      throw new Error(`última verificação de "${scraper.id}" é "${row.lastCell}", esperado "${expectedDate}"`);
    }
    if (sectionStatusValue !== expectedStatus) {
      throw new Error(`seção de "${scraper.id}" declara "${sectionStatusValue}", esperado "${expectedStatus}"`);
    }
    if (sectionStatus[1].trim() !== expectedDisplay) {
      throw new Error(`seção de "${scraper.id}" exibe "${sectionStatus[1].trim()}", esperado "${expectedDisplay}"`);
    }
    statuses[scraper.id] = expectedStatus;
  }

  if (/\bNode\s+\d+\/\d+/.test(markdown)) {
    throw new Error('providers.md ainda contém contagem de testes Node');
  }
  return { rows, history, statuses };
}

/**
 * Confere se a rodada corresponde à versão, ao perfil e às revisões atuais dos catálogos.
 * @param {object} round - Rodada parseada.
 * @param {object} scraper - Entrada do manifest.
 * @param {object} profiles - Documento de perfis.
 * @param {{ movie: object, tv: object }} catalogs - Catálogos atuais.
 * @returns {boolean} True quando a rodada ainda representa a configuração atual.
 */
function isCurrentRound(round, scraper, profiles, catalogs) {
  const profile = resolveProfile(profiles, scraper.id);
  const profileLabel = profile.exclusiveTag === null ? 'generalista' : profile.exclusiveTag;
  return round.packageVersion === scraper.version
    && round.profile === profileLabel
    && round.catalogs.movie.revision === catalogs.movie.revision
    && round.catalogs.tv.revision === catalogs.tv.revision;
}

/**
 * Extrai a seção de um provedor.
 * @param {string} markdown - Documento.
 * @param {string} name - Nome exato do provedor.
 * @returns {string} Conteúdo da seção, sem a próxima seção.
 * @throws {Error} Se a seção não existir.
 */
function extractSection(markdown, name) {
  const start = markdown.indexOf(`## ${name}\n`);
  if (start === -1) throw new Error(`seção "## ${name}" ausente`);
  const next = markdown.indexOf('\n## ', start + 3);
  return markdown.slice(start, next === -1 ? markdown.length : next + 1);
}

/**
 * Valida os dados mínimos de uma rodada.
 * @param {object} round - Rodada parseada.
 * @param {string} providerId - ID do provedor.
 * @returns {void}
 * @throws {Error} Se faltar campo, status ou coordenada.
 */
function validateRound(round, providerId) {
  if (!STATUS_VALUES.includes(round.status)) {
    throw new Error(`rodada "${round.id}" de "${providerId}" com status inválido`);
  }
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(round.date)) {
    throw new Error(`rodada "${round.id}" de "${providerId}" sem data ISO 8601`);
  }
  if (typeof round.packageVersion !== 'string' || round.packageVersion.trim() === '') {
    throw new Error(`rodada "${round.id}" de "${providerId}" sem versão do pacote`);
  }
  for (const item of round.cases) {
    if (item.mediaType === 'tv' && (!Number.isInteger(item.season) || !Number.isInteger(item.episode))) {
      throw new Error(`caso de série sem temporada/episódio na rodada "${round.id}"`);
    }
    if (item.mediaType === 'movie' && (item.season !== null || item.episode !== null)) {
      throw new Error(`caso de filme com coordenadas na rodada "${round.id}"`);
    }
  }
}

/**
 * Confere o status declarado na rodada contra os casos registrados.
 * @param {object} round - Rodada parseada.
 * @param {object} scraper - Entrada do manifest.
 * @returns {void}
 * @throws {Error} Se a rodada não tiver cinco casos por tipo aplicável ou o status divergir.
 */
function validateRoundStatus(round, scraper) {
  if (round.cases.length > 0) {
    for (const mediaType of scraper.supportedTypes) {
      const count = round.cases.filter((item) => item.mediaType === mediaType).length;
      if (count !== 5) {
        throw new Error(`rodada "${round.id}" de "${scraper.id}" tem ${count} casos ${mediaType}; esperado 5`);
      }
    }
  }
  const summary = aggregateProvider({
    provider: {
      enabled: round.status !== STATUSES.DISABLED,
      supportedTypes: scraper.supportedTypes,
    },
    cases: round.cases.map((item) => ({ mediaType: item.mediaType, outcome: item.outcome })),
  });
  if (round.status !== summary.status) {
    throw new Error(`rodada "${round.id}" de "${scraper.id}" declara "${round.status}", casos indicam "${summary.status}"`);
  }
}
