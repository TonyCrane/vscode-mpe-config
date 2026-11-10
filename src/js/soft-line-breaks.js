// SPDX-License-Identifier: AGPL-3.0-only
// 在渲染结果中连接软换行；保留硬换行、段落、源码定位和字面内容。

const tagSource = [
  String.raw`<!--[\s\S]*?-->`,
  String.raw`<![^>]*>`,
  String.raw`<\/?([a-z][\w:-]*)\b(?:[^>"']|"[^"]*"|'[^']*')*>`,
].join("|");

const textBlocks = new Set([
  "p", "li", "dt", "dd", "th", "td", "figcaption", "summary",
  "h1", "h2", "h3", "h4", "h5", "h6",
]);
const containers = new Set([
  "div", "section", "article", "header", "footer", "main", "nav", "aside",
  "blockquote", "ul", "ol", "dl", "table", "thead", "tbody", "tr", "figure",
]);
const literalTags = new Set([
  "pre", "script", "style", "textarea", "title", "xmp", "iframe",
]);
const protectedInlineTags = new Set(["code", "kbd", "samp"]);
const hiddenContentTags = new Set(["svg", "math", "template"]);
const voidTags = new Set([
  "area", "base", "br", "col", "embed", "hr", "img", "input", "link",
  "meta", "param", "source", "track", "wbr",
]);

// 同时覆盖汉字、全角标点及中文排版常用的引号、破折号和省略号。
const cjkCharacter = new RegExp(
  String.raw`[\p{Script=Han}\u3000-\u303F\uFE10-\uFE19\uFE30-\uFE4F` +
  String.raw`\uFF01-\uFF0F\uFF1A-\uFF20\uFF3B-\uFF40\uFF5B-\uFF60` +
  String.raw`\u2014\u2018-\u201F\u2026\u30FB]`,
  "u",
);

const boundary = "\uFFFC";
const entities = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00A0",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’", mdash: "—", hellip: "…",
};

function decodeCharacter(character) {
  if (!character.startsWith("&")) {
    return character;
  }

  const name = character.slice(1, -1);
  if (!name.startsWith("#")) {
    return entities[name] ?? boundary;
  }

  const hex = name[1].toLowerCase() === "x";
  const code = parseInt(name.slice(hex ? 2 : 1), hex ? 16 : 10);
  return code > 0 && code <= 0x10ffff
    ? String.fromCodePoint(code)
    : boundary;
}

function characterBefore(text, offset) {
  if (!offset) {
    return null;
  }

  const tail = text.slice(Math.max(0, offset - 40), offset);
  const entity = tail.match(/&(?:#x[\da-f]+|#\d+|[a-z]+);$/i);
  if (entity) {
    return decodeCharacter(entity[0]);
  }

  const code = text.charCodeAt(offset - 1);
  const length = code >= 0xdc00 && code <= 0xdfff ? 2 : 1;
  return text.slice(offset - length, offset);
}

function characterAfter(text, offset) {
  if (offset === text.length) {
    return null;
  }

  const head = text.slice(offset, offset + 40);
  const entity = head.match(/^&(?:#x[\da-f]+|#\d+|[a-z]+);/i);
  return entity
    ? decodeCharacter(entity[0])
    : String.fromCodePoint(text.codePointAt(offset));
}

function neighboringCharacter(fragments, index, direction) {
  for (let cursor = index + direction;
    cursor >= 0 && cursor < fragments.length;
    cursor += direction) {
    const text = fragments[cursor].text;
    if (text) {
      return direction < 0
        ? characterBefore(text, text.length)
        : characterAfter(text, 0);
    }
  }

  return null;
}

function normalizeBlock(fragments) {
  const replacements = [];

  fragments.forEach((fragment, index) => {
    if (!fragment.editable || !/[\r\n]/.test(fragment.text)) {
      return;
    }

    const text = fragment.text.replace(/\r\n?|\n/g, (newline, offset) => {
      const left = characterBefore(fragment.text, offset)
        ?? neighboringCharacter(fragments, index, -1);
      const right = characterAfter(fragment.text, offset + newline.length)
        ?? neighboringCharacter(fragments, index, 1);

      // <br>、块边界和公式等独立内容两侧的排版换行保持原样。
      if (!left || !right || left === boundary || right === boundary) {
        return newline;
      }

      return cjkCharacter.test(left) && cjkCharacter.test(right) ? "" : " ";
    });

    if (text !== fragment.text) {
      replacements.push({ ...fragment, replacement: text });
    }
  });

  return replacements;
}

function isMathOrDiagram(tag) {
  const classes = tag.match(/\bclass\s*=\s*(["'])(.*?)\1/i)?.[2] ?? "";
  return /(?:^|\s)(?:mermaid|katex(?:-\S+)?|mathjax(?:-\S+)?|MathJax)(?:\s|$)/
    .test(classes);
}

function joinSoftLineBreaks(html) {
  const tags = new RegExp(tagSource, "gi");
  const stack = [];
  const blocks = [];
  let cursor = 0;
  let match;

  function active() {
    return stack[stack.length - 1];
  }

  function addBoundary() {
    active()?.block?.push({ text: boundary, editable: false });
  }

  function collectText(end) {
    const context = active();
    if (context?.block && end > cursor) {
      context.block.push({
        start: cursor,
        text: html.slice(cursor, end),
        editable: !context.protected,
      });
    }
  }

  while ((match = tags.exec(html))) {
    collectText(match.index);
    cursor = tags.lastIndex;
    if (!match[1]) {
      continue;
    }

    const name = match[1].toLowerCase();
    const closing = match[0][1] === "/";

    if (closing) {
      const index = stack.map((context) => context.name).lastIndexOf(name);
      if (index !== -1) {
        stack.length = index;
      }
      if (textBlocks.has(name) || containers.has(name)) {
        addBoundary();
      }
      continue;
    }

    if (literalTags.has(name)) {
      addBoundary();
      const end = new RegExp(String.raw`<\/${name}\s*>`, "gi");
      end.lastIndex = tags.lastIndex;
      if (!end.exec(html)) {
        return html;
      }
      cursor = tags.lastIndex = end.lastIndex;
      continue;
    }

    if (voidTags.has(name)) {
      addBoundary();
      continue;
    }

    const parent = active();
    const hidden = parent?.hidden || hiddenContentTags.has(name)
      || isMathOrDiagram(match[0]);
    let block = parent?.block;

    if (hidden || containers.has(name)) {
      addBoundary();
      block = null;
    } else if (textBlocks.has(name)) {
      addBoundary();
      block = [];
      blocks.push(block);
    }

    if (!/\/\s*>$/.test(match[0])) {
      stack.push({
        name,
        block,
        hidden,
        protected: parent?.protected || protectedInlineTags.has(name),
      });
    }
  }

  collectText(html.length);
  const replacements = blocks.flatMap(normalizeBlock)
    .sort((left, right) => left.start - right.start);
  const parts = [];
  cursor = 0;

  for (const fragment of replacements) {
    parts.push(html.slice(cursor, fragment.start), fragment.replacement);
    cursor = fragment.start + fragment.text.length;
  }

  parts.push(html.slice(cursor));
  return parts.join("");
}

module.exports = joinSoftLineBreaks;
