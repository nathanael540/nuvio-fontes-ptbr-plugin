/** Substituto de teste: somente seleção CSS, find, text, html e attr; não comprova o jsoup/QuickJS. */
function load(html) {
  const root = { children: [] };
  const stack = [root];
  const decode = (text) => text.replace(/&(amp|quot|#39|lt|gt);/g, (_, entity) => ({ amp: '&', quot: '"', '#39': "'", lt: '<', gt: '>' })[entity]);
  for (const match of html.matchAll(/<!--[\s\S]*?-->|<[^>]*>|[^<]+/g)) {
    const token = match[0];
    if (/^<!--|^<!/.test(token)) continue;
    if (token.startsWith('</')) { stack.pop(); continue; }
    const parent = stack[stack.length - 1];
    if (!token.startsWith('<')) { parent.children.push({ text: decode(token) }); continue; }
    const tag = /^<([\w-]+)/.exec(token)?.[1];
    if (!tag) continue;
    const attrs = {};
    for (const attr of token.matchAll(/([\w-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[attr[1]] = decode(attr[2] ?? attr[3]);
    const node = { tag, attrs, children: [], parent };
    parent.children.push(node);
    if (!/\/$/.test(token.slice(0, -1)) && !['input', 'img', 'br', 'source', 'meta', 'link', 'hr'].includes(tag)) stack.push(node);
  }
  function descendants(node) { return node.children ? node.children.flatMap((child) => [child, ...descendants(child)]) : []; }
  function matches(node, selector) {
    if (!node.tag) return false;
    const tag = /^[\w-]+/.exec(selector)?.[0];
    if (tag && node.tag !== tag) return false;
    for (const [, prefix, name] of selector.matchAll(/([.#])([\w-]+)/g)) {
      if (prefix === '#' ? node.attrs.id !== name : !(node.attrs.class || '').split(/\s+/).includes(name)) return false;
    }
    for (const [, name] of selector.matchAll(/\[([\w-]+)\]/g)) if (!(name in node.attrs)) return false;
    return true;
  }
  function select(nodes, selector) {
    let found = nodes;
    for (const part of selector.split(/\s+/)) found = [...new Set(found.flatMap(descendants).filter((node) => matches(node, part)))];
    return wrap(found);
  }
  function text(node) { return node.text ?? node.children.map(text).join(''); }
  function serialize(node) {
    if (node.text !== undefined) return node.text;
    if (!node.children) return '';
    return node.children.map((child) => {
      if (child.text !== undefined) return child.text;
      const attrs = Object.entries(child.attrs).map(([key, value]) => ` ${key}="${value}"`).join('');
      return `<${child.tag}${attrs}>${serialize(child)}</${child.tag}>`;
    }).join('');
  }
  function wrap(nodes) {
    return {
      _nodes: nodes,
      length: nodes.length,
      eq: (index) => wrap(index >= 0 && index < nodes.length ? [nodes[index]] : []),
      find: (selector) => select(nodes, selector),
      text: () => nodes.map(text).join(''),
      html: () => nodes.map(serialize).join(''),
      attr: (key) => nodes[0]?.attrs[key],
    };
  }
  return (selector) => typeof selector === 'string' ? select([root], selector) : selector?._nodes ? selector : wrap([]);
}
module.exports = { load };
