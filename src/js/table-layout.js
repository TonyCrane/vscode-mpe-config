// SPDX-License-Identifier: AGPL-3.0-only
// 表格布局：识别列类型，添加布局属性和滚动容器
// 单元格内容保持原样，样式由 tables.less 控制

const numberPattern =
  /^[+−-]?(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?\s*(?:%|[KMGT]?i?B|ms|s)?$/i;
const timePattern =
  /^\d{1,2}:\d{2}(?::\d{2})?(?:\s*[–—-]\s*\d{1,2}:\d{2}(?::\d{2})?)?$/;

function textOf(markup) {
  return markup
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;|&#160;/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function cellsOf(row) {
  return [...row.matchAll(/<(th|td)\b[^>]*>([\s\S]*?)<\/\1>/gi)];
}

function classifyColumn(rows, index) {
  const cells = rows.map((row) => row[index][2]);
  const values = cells.map(textOf).filter(Boolean);

  if (values.length && values.every((value) => numberPattern.test(value))) {
    return "number";
  }

  if (values.length && values.every((value) => timePattern.test(value))) {
    return "time";
  }

  const identifiers = cells.every((cell) => {
    const codeOnly = /^\s*<code\b[^>]*>[\s\S]*<\/code>\s*$/i.test(cell);
    return codeOnly && textOf(cell).length <= 24;
  });

  return identifiers ? "identifier" : "text";
}

function describeLayout(rows, kinds) {
  const columns = kinds.length;
  const valueColumns = kinds.filter((kind) => {
    return kind === "number" || kind === "time";
  }).length;
  const layout =
    valueColumns >= Math.ceil((columns - 1) / 2) ? "data" : "prose";

  const compactLabels = rows.every((row) => {
    return textOf(row[0][2]).length <= 18;
  });
  const compactLast =
    columns === 3 &&
    !compactLabels &&
    rows.every((row) => {
      return textOf(row[columns - 1][2]).length <= 24;
    });

  const classes = [
    compactLabels ? "mpe-table-row-labels" : "",
    compactLast ? "mpe-table-compact-last" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return { layout, classes };
}

function decorateCell(cell, kind) {
  return cell.replace(
    /^(<(?:th|td)\b[^>]*)(>)/i,
    (match, open, close) => `${open} data-mpe-column="${kind}"${close}`,
  );
}

function decorateRow(row, kinds) {
  let column = 0;

  return row.replace(/<(th|td)\b[^>]*>[\s\S]*?<\/\1>/gi, (cell) => {
    const kind = kinds[column];
    column += 1;
    return decorateCell(cell, kind);
  });
}

function appendClasses(attributes, classes) {
  if (!classes) {
    return attributes;
  }

  if (/\bclass\s*=\s*(["'])/i.test(attributes)) {
    return attributes.replace(
      /\bclass\s*=\s*(["'])(.*?)\1/i,
      (all, quote, existing) => {
        return `class=${quote}${existing} ${classes}${quote}`;
      },
    );
  }

  return `${attributes} class="${classes}"`;
}

function decorateTableTag(table, classes, layout, columns) {
  return table.replace(/^<table\b([^>]*)>/i, (match, attributes) => {
    const decorated = appendClasses(attributes, classes);

    return (
      `<table${decorated}` +
      ` data-mpe-table-layout="${layout}"` +
      ` data-mpe-column-count="${columns}">`
    );
  });
}

function enhanceTable(table) {
  const opening = table.match(/^<table\b([^>]*)>/i);
  if (!opening || /\bdata-mpe-table-layout=/.test(opening[1])) {
    return table;
  }

  const mergedCells = /\b(?:colspan|rowspan)\s*=\s*["']?[2-9]/i.test(table);
  const nestedTables = (table.match(/<table\b/gi) || []).length > 1;
  if (mergedCells || nestedTables) {
    return table;
  }

  const head = table.match(/<thead\b[^>]*>([\s\S]*?)<\/thead>/i);
  const body = table.match(/<tbody\b[^>]*>([\s\S]*?)<\/tbody>/i);
  if (!head || !body) {
    return table;
  }

  const headers = cellsOf(head[1]);
  const rows = [...body[1].matchAll(/<tr\b[^>]*>[\s\S]*?<\/tr>/gi)].map(
    (match) => cellsOf(match[0]),
  );
  const columns = headers.length;
  const inconsistentRows = rows.some((row) => row.length !== columns);

  if (!columns || !rows.length || inconsistentRows) {
    return table;
  }

  const kinds = headers.map((header, index) => classifyColumn(rows, index));
  const { layout, classes } = describeLayout(rows, kinds);
  const enhancedHead = decorateRow(head[0], kinds);
  const enhancedBody = body[0].replace(
    /<tr\b[^>]*>[\s\S]*?<\/tr>/gi,
    (row) => decorateRow(row, kinds),
  );

  table = table
    .replace(head[0], () => enhancedHead)
    .replace(body[0], () => enhancedBody);
  table = decorateTableTag(table, classes, layout, columns);

  return (
    '<div class="mpe-table-wrap" tabindex="0" role="group" aria-label="表格">' +
    table +
    "</div>"
  );
}

function enhanceTables(html) {
  return html.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, enhanceTable);
}

module.exports = enhanceTables;
