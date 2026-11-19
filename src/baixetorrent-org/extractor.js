/**
 * Provedor BaixeTorrents: busca o título no catálogo público baixetorrent.org e monta os
 * streams de magnets publicados no HTML dos posts, com o bloco wordpress-torrent.
 */

/** @type {import('../_blocks/wordpress-torrent/index.mjs').WordpressCatalog} */
export const CATALOG = {
  name: 'Baixe Torrents',
  origins: ['https://www.baixetorrent.org'],
  logPrefix: 'BaixeTorrents',
  streamLabel: 'Baixe Torrents',
};
