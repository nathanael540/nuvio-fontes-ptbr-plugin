/**
 * Rede BaixaRápido: 11 catálogos consultados em paralelo, isolados, com domínio `www`
 * como reserva só por falha e deduplicação por `infoHash` (magnet) ou `torrent://<hash>/<índice>`.
 *
 * Ordem de preferência dos catálogos (Decisão 4):
 * 1. baixarapido
 * 2. limpotorrents
 * 3. brutotorrent
 * 4. temtorrents
 * 5. gratistorrent
 * 6. hdrtorrents
 * 7. salvetorrent
 * 8. parabaixar
 * 9. semtorrent
 * 10. redestorrents
 * 11. apachetorrents
 */

import { FORMATTER } from '../_blocks/custom-formatter/index.mjs';
import { collectApacheTorrents } from './apachetorrents.js';
import { collectBaixaRapido } from './baixarapido.js';
import { collectDownloadRow } from './download-row.js';
import { collectGratisTorrent } from './gratistorrent.js';
import { collectListaDownload } from './lista-download.js';
import { collectParaBaixar } from './parabaixar.js';

export const STREAM_LABEL = 'Baixa Rápido';
// Template do name/title (bloco custom-formatter): a variante de build fixa o formato; o base sorteia.
export const STREAM_FORMATTER = FORMATTER.AUTO;

export const CATALOGS = [
  {
    name: 'baixarapido',
    provider: 'baixarapido',
    family: 'baixarapido',
    origins: ['https://baixarapido.com', 'https://www.baixarapido.com'],
    logPrefix: 'Baixa Rápido/baixarapido',
    streamLabel: STREAM_LABEL,
    formatter: STREAM_FORMATTER,
  },
  {
    name: 'limpotorrents',
    provider: 'limpotorrents',
    family: 'lista-download',
    cardVariant: 'limpotorrents',
    origins: ['https://limpotorrents.com', 'https://www.limpotorrents.com'],
    logPrefix: 'Baixa Rápido/limpotorrents',
    streamLabel: STREAM_LABEL,
    formatter: STREAM_FORMATTER,
  },
  {
    name: 'brutotorrent',
    provider: 'brutotorrent',
    family: 'download-row',
    cardVariant: 'bruto-card',
    origins: ['https://brutotorrent.com', 'https://www.brutotorrent.com'],
    logPrefix: 'Baixa Rápido/brutotorrent',
    streamLabel: STREAM_LABEL,
    formatter: STREAM_FORMATTER,
  },
  {
    name: 'temtorrents',
    provider: 'temtorrents',
    family: 'download-row',
    cardVariant: 'media-list-item',
    origins: ['https://temtorrents.com', 'https://www.temtorrents.com'],
    logPrefix: 'Baixa Rápido/temtorrents',
    streamLabel: STREAM_LABEL,
    formatter: STREAM_FORMATTER,
  },
  {
    name: 'gratistorrent',
    provider: 'gratistorrent',
    family: 'gratistorrent',
    origins: ['https://gratistorrent.com', 'https://www.gratistorrent.com'],
    logPrefix: 'Baixa Rápido/gratistorrent',
    streamLabel: STREAM_LABEL,
    formatter: STREAM_FORMATTER,
  },
  {
    name: 'hdrtorrents',
    provider: 'hdrtorrents',
    family: 'download-row',
    cardVariant: 'media-card-link',
    origins: ['https://hdrtorrents.net', 'https://www.hdrtorrents.net'],
    logPrefix: 'Baixa Rápido/hdrtorrents',
    streamLabel: STREAM_LABEL,
    formatter: STREAM_FORMATTER,
  },
  {
    name: 'salvetorrent',
    provider: 'salvetorrent',
    family: 'lista-download',
    cardVariant: 'salvetorrent',
    origins: ['https://salvetorrent.com', 'https://www.salvetorrent.com'],
    logPrefix: 'Baixa Rápido/salvetorrent',
    streamLabel: STREAM_LABEL,
    formatter: STREAM_FORMATTER,
  },
  {
    name: 'parabaixar',
    provider: 'parabaixar',
    family: 'parabaixar',
    origins: ['https://parabaixar.com', 'https://www.parabaixar.com'],
    logPrefix: 'Baixa Rápido/parabaixar',
    streamLabel: STREAM_LABEL,
    formatter: STREAM_FORMATTER,
  },
  {
    name: 'semtorrent',
    provider: 'semtorrent',
    family: 'download-row',
    cardVariant: 'media-card-link',
    origins: ['https://semtorrent.com', 'https://www.semtorrent.com'],
    logPrefix: 'Baixa Rápido/semtorrent',
    streamLabel: STREAM_LABEL,
    formatter: STREAM_FORMATTER,
  },
  {
    name: 'redestorrents',
    provider: 'redestorrents',
    family: 'download-row',
    cardVariant: 'custom-card',
    origins: ['https://redestorrents.com', 'https://www.redestorrents.com'],
    logPrefix: 'Baixa Rápido/redestorrents',
    streamLabel: STREAM_LABEL,
    formatter: STREAM_FORMATTER,
  },
  {
    name: 'apachetorrents',
    provider: 'apachetorrents',
    family: 'apachetorrents',
    origins: ['https://apachetorrents.com', 'https://www.apachetorrents.com'],
    logPrefix: 'Baixa Rápido/apachetorrents',
    streamLabel: STREAM_LABEL,
    formatter: STREAM_FORMATTER,
  },
];

const READERS = {
  baixarapido: collectBaixaRapido,
  'download-row': collectDownloadRow,
  'lista-download': collectListaDownload,
  parabaixar: collectParaBaixar,
  gratistorrent: collectGratisTorrent,
  apachetorrents: collectApacheTorrents,
};

/**
 * Consulta os onze catálogos da rede em paralelo e junta as listas sem repetir torrent.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido validado.
 * @returns {Promise<object[]>} Streams deduplicados na ordem de preferência dos catálogos.
 * @throws {Error} Se nenhum catálogo produzir stream e ao menos um tiver falhado.
 */
export async function collectStreams(media, request) {
  readMedia(media);
  // allSettled não está confirmado no QuickJS: cada promessa já nasce resolvida.
  const results = await Promise.all(CATALOGS.map((catalog) => collectSingleCatalog(catalog, media, request)
    .then((streams) => ({ catalog, streams }))
    .catch((error) => ({ catalog, failure: `${catalog.name}: ${error.message}` }))));

  const streams = new Map();
  const failures = [];
  for (const result of results) {
    if (result.failure) {
      failures.push(result.failure);
      continue;
    }
    for (const stream of result.streams) {
      const key = streamKey(stream);
      if (!streams.has(key)) streams.set(key, stream);
    }
  }
  if (!streams.size && failures.length) {
    throw new Error(failures.join('; '));
  }
  for (const failure of failures) {
    console.warn(`[${STREAM_LABEL}] Catálogo descartado: ${failure}`);
  }
  return [...streams.values()];
}

/**
 * @param {object} catalog
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request
 * @returns {Promise<object[]>}
 */
async function collectSingleCatalog(catalog, media, request) {
  const reader = READERS[catalog.family];
  if (!reader) throw new Error(`família de página desconhecida: "${catalog.family}"`);
  return reader(catalog, media, request);
}

/**
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media
 * @returns {void}
 */
function readMedia(media) {
  if (!media || typeof media.title !== 'string' || typeof media.originalTitle !== 'string') {
    throw new Error('TMDB: MediaInfo sem title ou originalTitle');
  }
  if (!Array.isArray(media.alternativeTitles)) throw new Error('TMDB: MediaInfo sem alternativeTitles');
  if (media.year !== null && !Number.isInteger(media.year)) throw new Error('TMDB: MediaInfo.year inválido');
  if (media.imdbId !== null && typeof media.imdbId !== 'string') throw new Error('TMDB: MediaInfo.imdbId inválido');
}

/**
 * Chave de repetição: o mesmo torrent (magnet) ou o mesmo arquivo dentro dele (`torrent://`).
 * @param {{ url: string, infoHash: string }} stream
 * @returns {string}
 */
function streamKey(stream) {
  return stream.url.startsWith('torrent://') ? stream.url : `magnet:${stream.infoHash}`;
}
