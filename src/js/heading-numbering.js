// SPDX-License-Identifier: AGPL-3.0-only
// 标题编号：整篇结构通过校验后，才添加显示编号
// 各分支可分别跳级；每个父标题的直接子标题须使用相同的 HTML 等级

const tagSource = [
  String.raw`<!--[\s\S]*?-->`,
  String.raw`<![^>]*>`,
  String.raw`<\/?([a-z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>`,
].join("|");

const voidTags = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

const opaqueTags = new Set([
  "pre",
  "code",
  "script",
  "style",
  "textarea",
  "title",
  "xmp",
  "iframe",
  "svg",
  "math",
  "template",
]);

const excludedTags = new Set([
  "blockquote",
  "ul",
  "ol",
  "dl",
  "table",
  "nav",
  "aside",
  "figure",
]);

const entities = {
  nbsp: " ",
  ensp: " ",
  emsp: " ",
  thinsp: " ",
  Tab: " ",
  NewLine: " ",
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  period: ".",
  lpar: "(",
  rpar: ")",
  colon: ":",
};

const chineseDigits = "零〇一二三四五六七八九十百千万壹贰叁肆伍陆柒捌玖拾佰仟";
const manualNumberPatterns = [
  // 阿拉伯数字：1.2、1.、1）以及带空格的 1 标题
  String.raw`\d+(?:[.．]\d+)+(?=\s|$|[.．、:：)）])`,
  String.raw`\d+[.．、)）](?!\d)`,
  String.raw`\d{1,2}\s+\S`,

  // 字母、罗马数字和中文数字
  String.raw`[A-Za-z][.．、)）]\s*\S`,
  String.raw`[IVXLCDMivxlcdm]+[.．、)）]\s*\S`,
  String.raw`[${chineseDigits}]+[、.．)）]`,

  // 括号编号、章节编号和带圈数字
  String.raw`[（(](?:\d+|[A-Za-z]|[IVXLCDMivxlcdm]+|[${chineseDigits}]+)[）)]`,
  String.raw`第[\d${chineseDigits}]+[章节篇部卷]`,
  String.raw`[①-⑳㉑-㉟㊱-㊿❶-❿]`,
];

const manualNumber = new RegExp(
  `^(?:${manualNumberPatterns.join("|")})`,
  "u",
);

function decodeEntity(entity, name) {
  if (name[0] !== "#") {
    return entities[name] ?? entity;
  }

  const hex = name[1].toLowerCase() === "x";
  const code = parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);

  if (code > 0 && code <= 0x10ffff) {
    return String.fromCodePoint(code);
  }

  return "\ufffd";
}

function headingText(markup) {
  return markup
    .replace(new RegExp(tagSource, "gi"), "")
    .replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, decodeEntity)
    .trim();
}

// 记录标题的原始位置，后续只在起始标签上添加编号属性
function collectHeadings(html) {
  const tags = new RegExp(tagSource, "gi");
  const ancestors = [];
  const headings = [];
  let heading = null;
  let match;

  while ((match = tags.exec(html))) {
    if (!match[1]) {
      continue;
    }

    const name = match[1].toLowerCase();
    const closing = match[0][1] === "/";
    const excluded = ancestors.some((tag) => excludedTags.has(tag));

    if (closing) {
      if (/^h[1-6]$/.test(name) && !excluded) {
        if (!heading || heading.level !== Number(name[1])) {
          return null;
        }

        const markup = html.slice(heading.contentStart, match.index);
        heading.text = headingText(markup);
        headings.push(heading);
        heading = null;
      }

      const index = ancestors.lastIndexOf(name);
      if (index !== -1) {
        ancestors.length = index;
      }

      continue;
    }

    if (opaqueTags.has(name)) {
      const end = new RegExp(String.raw`<\/${name}\s*>`, "gi");
      end.lastIndex = tags.lastIndex;

      if (!end.exec(html)) {
        return null;
      }

      tags.lastIndex = end.lastIndex;
      continue;
    }

    if (/^h[1-6]$/.test(name) && !excluded) {
      if (heading) {
        return null;
      }

      heading = {
        level: Number(name[1]),
        start: match.index,
        open: match[0],
        contentStart: tags.lastIndex,
      };
    }

    if (!voidTags.has(name) && !/\/\s*>$/.test(match[0])) {
      ancestors.push(name);
    }
  }

  return heading ? null : headings;
}

// 根据实际父子关系计数；一级标题建立新的编号起点
function assignNumbers(headings) {
  const root = {
    level: 0,
    childLevel: null,
    count: 0,
    path: [],
  };
  const ancestors = [root];
  let valid = true;

  for (const heading of headings) {
    if (!heading.text || manualNumber.test(heading.text)) {
      valid = false;
    }

    while (ancestors[ancestors.length - 1].level >= heading.level) {
      ancestors.pop();
    }

    const parent = ancestors[ancestors.length - 1];
    if (parent.childLevel !== null && parent.childLevel !== heading.level) {
      valid = false;
    }

    parent.childLevel = heading.level;
    parent.count += 1;

    heading.path = heading.level === 1 ? [] : [...parent.path, parent.count];
    heading.childLevel = null;
    heading.count = 0;
    ancestors.push(heading);
  }

  return valid;
}

function setNumberAttribute(open, number) {
  const attributes = /\s+([^\s=/>]+)(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?/g;
  const clean = open.replace(attributes, (attribute, name) => {
    if (name.toLowerCase() === "data-mpe-heading-number") {
      return "";
    }

    return attribute;
  });

  if (number === null) {
    return clean;
  }

  return clean.replace(/>$/, ` data-mpe-heading-number="${number}">`);
}

function numberHeadings(html) {
  const headings = collectHeadings(html);
  if (!headings || !headings.length) {
    return html;
  }

  const valid = assignNumbers(headings);
  const parts = [];
  let cursor = 0;

  for (const heading of headings) {
    const number =
      valid && heading.level !== 1 ? heading.path.join(".") : null;

    parts.push(
      html.slice(cursor, heading.start),
      setNumberAttribute(heading.open, number),
    );
    cursor = heading.start + heading.open.length;
  }

  parts.push(html.slice(cursor));
  return parts.join("");
}

module.exports = numberHeadings;
