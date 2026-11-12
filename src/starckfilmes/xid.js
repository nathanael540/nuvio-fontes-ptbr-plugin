/**
 * Decodificação e permutação local de identificadores xid da fonte Starck Filmes.
 *
 * A fonte codifica o link magnet aplicando uma permutação circular sobre a string Base64.
 * A regra observada percorre circularmente as posições ainda não usadas da sequência,
 * começando em zero, selecionando a próxima posição disponível e avançando três posições
 * a cada seleção. O resultado desfeito é a string Base64 original do link magnet.
 */

/**
 * Desfaz a permutação circular do xid e decodifica o link magnet resultante.
 *
 * @param {string} xid - Sequência codificada obtida do link filmedl.com/?xid=...
 * @returns {string} Link magnet decodificado iniciando com magnet:?.
 * @throws {Error} Se a entrada for inválida, Base64 malformado ou o resultado não for magnet.
 * @example
 * decodeXid('bj1W11FXZnYHbWAm5lVkM0a0OWEj5l9oM4YkdSYDUl1yM1MkcFZmM04wc6MmYSFnUjRyapM2aDVDEyowLzOmRD9DBwYwZyJWST5kIidwaKVXM0RkV0dCbJL3NUJ1RyNMZZJWRT5UI0NwLGSmNENVRvVSbGJSSTUUIzdwQNRTVFgjVwRBJETTQCJ0UGRyYUMWRD5kUuNubYM3QSVSZuZ0Ykc2bjU');
 * // 'magnet:?xt=urn:btih:3D62JGJ2GI7SYECF5UFIGMV4DCDTFCXA&dn=Wandinha...'
 */
export function decodeXid(xid) {
  if (typeof xid !== 'string' || !xid.trim()) {
    throw new Error('xid deve ser texto não vazio');
  }
  const str = xid.trim();
  const len = str.length;
  const used = new Array(len).fill(false);
  const chars = new Array(len);
  let pos = 0;

  for (let r = 0; r < len; r++) {
    while (used[pos]) {
      pos = (pos + 1) % len;
    }
    used[pos] = true;
    chars[r] = str[pos];
    pos = (pos + 3) % len;
  }

  let base64 = chars.join('').replace(/-/g, '+').replace(/_/g, '/');
  const mod = base64.length % 4;
  if (mod !== 0) {
    base64 += '='.repeat(4 - mod);
  }

  let decoded;
  try {
    decoded = atob(base64);
  } catch (err) {
    throw new Error(`Falha ao decodificar Base64 do xid: ${err.message}`, { cause: err });
  }

  if (!decoded.startsWith('magnet:?')) {
    throw new Error(`xid decodificado não inicia com magnet:? ("${decoded.slice(0, 30)}")`);
  }

  return decoded;
}
