/**
 * Rede Comando: Filmestorrent, Comando Torrents, Mestre dos Filmes e Torrent dos Filmes.
 *
 * Os sites da rede são WordPress e compartilham o mesmo banco ou boa parte dele. O provedor consulta
 * três catálogos em paralelo, cada um isolado, e junta as listas sem repetir torrent:
 * magnet pelo `infoHash` e `torrent://` pelo hash e índice. Entre repetidos, fica o do catálogo
 * Comando. A busca e a montagem dos streams ficam no bloco wordpress-torrent.
 */

import { collectWordpressTorrents } from '../_blocks/wordpress-torrent/index.mjs';

/** @type {import('../_blocks/wordpress-torrent/index.mjs').WordpressCatalog[]} */
export const CATALOGS = [
  {
    // Mesmo banco em cinco domínios: os seguintes só são usados se o anterior falhar.
    name: 'Comando',
    origins: [
      'https://filmestorrent.tv',
      'https://filmestorrent.club',
      'https://comando1.com',
      'https://comandotorrents.co',
      'https://comandotorrents.to',
    ],
    logPrefix: 'Filmestorrent',
    streamLabel: 'Filmestorrent',
  },
  {
    // Catálogo com posts próprios além dos repetidos: consultado junto, não como reserva.
    name: 'Mestre dos Filmes',
    origins: ['https://mestredosfilmes.top'],
    logPrefix: 'Filmestorrent/Mestre dos Filmes',
    streamLabel: 'Filmestorrent',
  },
  {
    name: 'Torrent dos Filmes',
    origins: ['https://torrentdosfilmes-v2.xyz'],
    logPrefix: 'Filmestorrent/Torrent dos Filmes',
    streamLabel: 'Filmestorrent',
  },
];

/**
 * Consulta os catálogos da rede e devolve a lista única, sem torrents repetidos.
 * @param {import('../_blocks/tmdb-info/index.mjs').MediaInfo} media - Dados do TMDB.
 * @param {{ mediaType: 'movie'|'tv', season: number|null, episode: number|null }} request - Pedido já validado.
 * @returns {Promise<object[]>} Streams ainda não ordenados.
 * @throws {Error} Se nenhum catálogo produzir stream e algum tiver falhado.
 */
export async function collectStreams(media, request) {
  // allSettled não está confirmado no QuickJS: cada promessa já nasce resolvida.
  const results = await Promise.all(CATALOGS.map((catalog) => collectWordpressTorrents(catalog, media, request)
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
  if (!streams.size && failures.length) throw new Error(failures.join('; '));
  for (const failure of failures) console.warn(`[Filmestorrent] Catálogo descartado: ${failure}`);
  return [...streams.values()];
}

/**
 * Chave de repetição: o mesmo torrent (magnet) ou o mesmo arquivo dentro dele (`torrent://`).
 * @param {{ url: string, infoHash: string }} stream
 * @returns {string}
 */
function streamKey(stream) {
  return stream.url.startsWith('torrent://') ? stream.url : `magnet:${stream.infoHash}`;
}
