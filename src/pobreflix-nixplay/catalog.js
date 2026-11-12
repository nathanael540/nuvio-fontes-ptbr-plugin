/** Resolução dos aliases do catálogo PobreFlix, antes de qualquer POST. */

import { fetchPage } from '../_blocks/http/index.mjs';

export const ALIASES = Object.freeze([
  'https://pobreflix.boutique',
  'https://pobreflix.cab',
  'https://pobreflix.garden',
  'https://pobreflix.monster',
]);

export const APPROVED_ORIGINS = Object.freeze(new Set(ALIASES));


/**
 * Lê a página e valida origem final e identidade do catálogo antes do player.
 * Os redirecionamentos HTTP e seus limites são gerenciados pelo fetch do app.
 * @param {string} initialUrl - Alias de entrada aprovado.
 * @param {{ getCount: number, maxGets: number }} budget - Orçamento das consultas de página.
 * @returns {Promise<{ effectiveOrigin: string, html: string, finalUrl: string }>} Origem verificada.
 * @throws {Error} Se a origem, o tema, a resposta ou o orçamento forem inválidos.
 */
export async function resolveEffectiveOrigin(initialUrl, budget = { getCount: 0, maxGets: 10 }) {
  if (!APPROVED_ORIGINS.has(new URL(initialUrl).origin)) {
    throw new Error(`Origem inicial não aprovada: ${initialUrl}`);
  }
  if (budget.getCount >= budget.maxGets) throw new Error('Orçamento de requisições de página esgotado');
  budget.getCount++;
  const page = await fetchPage(initialUrl.endsWith('/') ? initialUrl : `${initialUrl}/`);
  const effectiveOrigin = new URL(page.url).origin;
  if (!APPROVED_ORIGINS.has(effectiveOrigin)) {
    throw new Error(`Origem final não aprovada: ${effectiveOrigin}`);
  }
  if (!/pobreflix-v10/i.test(page.text)) throw new Error(`Tema pobreflix-v10-* não identificado em ${page.url}`);
  return { effectiveOrigin, html: page.text, finalUrl: page.url };
}
