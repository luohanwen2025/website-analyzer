// 轻量 Markdown 渲染器（纯函数）
// 覆盖：标题、列表、表格、加粗、行内代码、段落；转义防 XSS

/**
 * 转义 HTML 危险字符
 * @param {string} text
 * @returns {string}
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * 渲染行内格式（加粗、行内代码）
 * @param {string} text 已转义文本
 * @returns {string}
 */
function renderInline(text) {
  // 加粗 **text**
  let out = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  // 行内代码 `code`
  out = out.replace(/`([^`]+)`/g, '<code>$1</code>');
  return out;
}

/**
 * 渲染 Markdown 为 HTML
 * @param {string} md
 * @returns {string}
 */
export function renderMarkdown(md) {
  if (!md) return '';

  const lines = md.replace(/\r\n/g, '\n').split('\n');
  const html = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 空行
    if (/^\s*$/.test(line)) {
      i++;
      continue;
    }

    // 标题
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      html.push(`<h${level}>${renderInline(escapeHtml(headingMatch[2]))}</h${level}>`);
      i++;
      continue;
    }

    // 表格：连续的 | 行，且第二行是分隔行 |---|
    if (line.includes('|') && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1])) {
      const parseRow = (rowLine) =>
        rowLine
          .replace(/^\s*\|/, '')
          .replace(/\|\s*$/, '')
          .split('|')
          .map((c) => c.trim());

      const headerCells = parseRow(line).map((c) => `<th>${renderInline(escapeHtml(c))}</th>`);
      html.push('<table><thead><tr>' + headerCells.join('') + '</tr></thead><tbody>');
      i += 2; // 跳过表头与分隔行
      while (i < lines.length && lines[i].includes('|') && !/^\s*$/.test(lines[i])) {
        const cells = parseRow(lines[i]).map((c) => `<td>${renderInline(escapeHtml(c))}</td>`);
        html.push('<tr>' + cells.join('') + '</tr>');
        i++;
      }
      html.push('</tbody></table>');
      continue;
    }

    // 无序列表
    if (/^\s*[-*+]\s+/.test(line)) {
      html.push('<ul>');
      while (i < lines.length && /^\s*[-*+]\s+/.test(lines[i])) {
        const item = lines[i].replace(/^\s*[-*+]\s+/, '');
        html.push(`<li>${renderInline(escapeHtml(item))}</li>`);
        i++;
      }
      html.push('</ul>');
      continue;
    }

    // 有序列表
    if (/^\s*\d+\.\s+/.test(line)) {
      html.push('<ol>');
      while (i < lines.length && /^\s*\d+\.\s+/.test(lines[i])) {
        const item = lines[i].replace(/^\s*\d+\.\s+/, '');
        html.push(`<li>${renderInline(escapeHtml(item))}</li>`);
        i++;
      }
      html.push('</ol>');
      continue;
    }

    // 段落（连续非空行合并）
    const paraLines = [line];
    i++;
    while (
      i < lines.length &&
      !/^\s*$/.test(lines[i]) &&
      !/^(#{1,6})\s+/.test(lines[i]) &&
      !/^\s*[-*+]\s+/.test(lines[i]) &&
      !/^\s*\d+\.\s+/.test(lines[i]) &&
      !(lines[i].includes('|') && i + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[i + 1]))
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    html.push(`<p>${renderInline(escapeHtml(paraLines.join(' ')))}</p>`);
  }

  return html.join('\n');
}
