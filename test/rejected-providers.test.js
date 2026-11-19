const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');

const ALLOWED_CATEGORIES = new Set([
  'Bloqueio anti-bot',
  'Autenticação ou chave',
  'Execução incompatível',
  'Sem mídia utilizável',
  'Escopo ou duplicidade',
]);

const REQUIRED_FIELDS = [
  'Data da rejeição',
  'Categoria',
  'Domínios investigados',
  'Motivo',
  'Evidência e referência',
  'Critério de reavaliação',
];

const EXPECTED_HEADER = '| Provedor | ID | Categoria | Motivo resumido | Data |';

function toHeadingAnchor(title) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-');
}

function isValidIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function assertSanitized(markdown) {
  if (/magnet:\?/i.test(markdown)) {
    throw new Error('Link magnet não permitido em rejected-providers.md.');
  }
  if (/\b[a-f0-9]{64}\b/i.test(markdown)) {
    throw new Error('Hash SHA-256 não permitido em rejected-providers.md.');
  }
  if (/https?:\/\/[^\s/]+@[^\s]+/i.test(markdown)) {
    throw new Error('Credencial em URL não permitida em rejected-providers.md.');
  }
  if (/[?&](?:token|password|username|api[_-]?key|cookie)=/i.test(markdown)) {
    throw new Error('Parâmetro sensível em URL não permitido em rejected-providers.md.');
  }
}

function parseTable(lines) {
  const headerIndex = lines.findIndex((line) => line.trim() === EXPECTED_HEADER);
  if (headerIndex === -1) {
    throw new Error(`Cabeçalho da tabela resumo ausente ou fora do padrão: ${EXPECTED_HEADER}`);
  }
  const separator = (lines[headerIndex + 1] || '').trim();
  if (!/^\|\s*---/.test(separator)) {
    throw new Error('Separador da tabela resumo ausente após o cabeçalho.');
  }

  const rows = [];
  for (let i = headerIndex + 2; i < lines.length; i += 1) {
    const line = lines[i].trim();
    if (!line) {
      break;
    }
    if (!line.startsWith('|')) {
      throw new Error(`Linha inesperada na tabela resumo: ${line}`);
    }
    const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
    if (cells.length !== 5) {
      throw new Error(`Linha da tabela deve ter 5 colunas: ${line}`);
    }
    const [providerCell, idCell, category, summary, date] = cells;
    const linkMatch = providerCell.match(/^\[([^\]]+)\]\(#([^)]+)\)$/);
    if (!linkMatch) {
      throw new Error(`Coluna Provedor deve usar link de âncora [Nome](#ancora): ${providerCell}`);
    }
    const name = linkMatch[1].trim();
    const anchor = linkMatch[2].trim();
    if (anchor !== toHeadingAnchor(name)) {
      throw new Error(`Âncora "${anchor}" não corresponde ao título "${name}".`);
    }

    const idMatch = idCell.match(/^`([a-z0-9]+(?:-[a-z0-9]+)*)`$/);
    if (!idMatch) {
      throw new Error(`ID deve estar em kebab-case entre crases: ${idCell}`);
    }
    const id = idMatch[1];

    if (!ALLOWED_CATEGORIES.has(category)) {
      throw new Error(`Categoria inválida para "${id}": "${category}".`);
    }
    if (!summary) {
      throw new Error(`Motivo resumido vazio para "${id}".`);
    }
    if (!isValidIsoDate(date)) {
      throw new Error(`Data inválida para "${id}": "${date}". Use AAAA-MM-DD.`);
    }

    rows.push({ name, anchor, id, category, summary, date });
  }
  return rows;
}

function parseSections(lines) {
  const sections = [];
  let current = null;
  for (const rawLine of lines) {
    const headingMatch = rawLine.match(/^##\s+(.+?)\s*$/);
    if (headingMatch) {
      if (current) {
        sections.push(current);
      }
      current = { name: headingMatch[1], lines: [] };
      continue;
    }
    if (current) {
      current.lines.push(rawLine);
    }
  }
  if (current) {
    sections.push(current);
  }
  return sections;
}

function validateRejectedProvidersDocument({ markdown, manifest }) {
  assertSanitized(markdown);
  const lines = markdown.split(/\r?\n/);
  const rows = parseTable(lines);
  const sections = parseSections(lines);

  const seenIds = new Set();
  const manifestIds = new Set((manifest.scrapers || []).map((scraper) => scraper.id));

  for (const row of rows) {
    if (seenIds.has(row.id)) {
      throw new Error(`ID duplicado em rejected-providers.md: "${row.id}".`);
    }
    seenIds.add(row.id);
    if (manifestIds.has(row.id)) {
      throw new Error(`Conflito: "${row.id}" está publicado em manifest.json e listado em rejected-providers.md.`);
    }
  }

  if (sections.length !== rows.length) {
    throw new Error(`Quantidade de seções (${sections.length}) diverge das linhas da tabela (${rows.length}).`);
  }

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const section = sections[i];
    if (section.name !== row.name) {
      throw new Error(`Seção #${i + 1} é "${section.name}", esperado "${row.name}".`);
    }

    const fields = [];
    for (const line of section.lines) {
      const match = line.match(/^(\d+)\.\s+\*\*([^:]+):\*\*\s*(.+)$/);
      if (match) {
        fields.push({ index: Number(match[1]), label: match[2].trim(), value: match[3].trim() });
      }
    }

    if (fields.length !== REQUIRED_FIELDS.length) {
      throw new Error(`Seção "${section.name}" deve conter ${REQUIRED_FIELDS.length} campos numerados.`);
    }

    for (let f = 0; f < REQUIRED_FIELDS.length; f += 1) {
      const expectedLabel = REQUIRED_FIELDS[f];
      const field = fields[f];
      if (field.index !== f + 1 || field.label !== expectedLabel || !field.value) {
        throw new Error(`Campo ${f + 1} inválido na seção "${section.name}": esperado "${f + 1}. **${expectedLabel}:** ...".`);
      }
    }

    if (fields[0].value !== row.date) {
      throw new Error(`Data na seção "${section.name}" (${fields[0].value}) diverge da tabela (${row.date}).`);
    }
    if (fields[1].value !== row.category) {
      throw new Error(`Categoria na seção "${section.name}" (${fields[1].value}) diverge da tabela (${row.category}).`);
    }
  }

  return { rows, sections };
}

const VALID_SAMPLE = `# Provedores rejeitados

Texto introdutório.

| Provedor | ID | Categoria | Motivo resumido | Data |
| --- | --- | --- | --- | --- |
| [Fonte Exemplo](#fonte-exemplo) | \`fonte-exemplo\` | Bloqueio anti-bot | HTTP 403 com desafio Cloudflare | 2026-11-19 |

## Fonte Exemplo

1. **Data da rejeição:** 2026-11-19
2. **Categoria:** Bloqueio anti-bot
3. **Domínios investigados:** \`exemplo.invalid\`
4. **Motivo:** Todas as rotas responderam HTTP 403 com desafio gerenciado.
5. **Evidência e referência:** Teste manual em 2026-11-19.
6. **Critério de reavaliação:** Remoção do desafio no fetch direto.
`;

test('rejected-providers.md segue o padrão e não conflita com manifest.json', () => {
  const markdown = fs.readFileSync(path.join(ROOT, 'rejected-providers.md'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const result = validateRejectedProvidersDocument({ markdown, manifest });
  assert.ok(result.rows.length >= 2);
});

test('documento sintético válido e tabela vazia são aceitos', () => {
  const manifest = { scrapers: [{ id: 'megaembed' }] };
  assert.doesNotThrow(() => validateRejectedProvidersDocument({ markdown: VALID_SAMPLE, manifest }));
  const emptyDoc = `# Provedores rejeitados\n\n${EXPECTED_HEADER}\n| --- | --- | --- | --- | --- |\n`;
  const emptyResult = validateRejectedProvidersDocument({ markdown: emptyDoc, manifest });
  assert.equal(emptyResult.rows.length, 0);
});

test('data inválida, categoria desconhecida e seção divergente são rejeitadas', () => {
  const manifest = { scrapers: [] };
  assert.throws(
    () => validateRejectedProvidersDocument({ markdown: VALID_SAMPLE.replaceAll('2026-11-19', '2026-02-30'), manifest }),
    /Data inválida/,
  );
  assert.throws(
    () => validateRejectedProvidersDocument({ markdown: VALID_SAMPLE.replaceAll('Bloqueio anti-bot', 'Outro'), manifest }),
    /Categoria inválida/,
  );
  assert.throws(
    () => validateRejectedProvidersDocument({ markdown: VALID_SAMPLE.replace('2. **Categoria:** Bloqueio anti-bot', '2. **Categoria:** Escopo ou duplicidade'), manifest }),
    /diverge da tabela/,
  );
});

test('campo obrigatório ausente, conflito com manifest e segredo são rejeitados', () => {
  const manifest = { scrapers: [{ id: 'fonte-exemplo' }] };
  assert.throws(
    () => validateRejectedProvidersDocument({ markdown: VALID_SAMPLE, manifest }),
    /Conflito: "fonte-exemplo"/,
  );
  const withoutField = VALID_SAMPLE.replace('6. **Critério de reavaliação:** Remoção do desafio no fetch direto.\n', '');
  assert.throws(
    () => validateRejectedProvidersDocument({ markdown: withoutField, manifest: { scrapers: [] } }),
    /deve conter 6 campos numerados/,
  );
  assert.throws(
    () => validateRejectedProvidersDocument({ markdown: `${VALID_SAMPLE}\nhttps://exemplo.invalid/?token=abc`, manifest: { scrapers: [] } }),
    /Parâmetro sensível/,
  );
  assert.throws(
    () => validateRejectedProvidersDocument({ markdown: `${VALID_SAMPLE}\nmagnet:?xt=urn:btih:1234`, manifest: { scrapers: [] } }),
    /Link magnet não permitido/,
  );
});
