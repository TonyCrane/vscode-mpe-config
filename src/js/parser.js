// SPDX-License-Identifier: AGPL-3.0-only AND NCSA
// Copyright (c) 2017 ~ 2023 Yiyi Wang. All rights reserved.
// 模板来源：Crossnote 0.9.42
// 上游模板采用 NCSA；本地新增逻辑采用 AGPL-3.0-only
// MPE 解析钩子：https://shd101wyy.github.io/markdown-preview-enhanced/#/extend-parser
const numberHeadings = require("./heading-numbering.js");
const enhanceTables = require("./table-layout.js");

module.exports = {
  async onWillParseMarkdown(markdown) {
    return markdown;
  },

  async onDidParseMarkdown(html) {
    const numberedHtml = numberHeadings(html);
    return enhanceTables(numberedHtml);
  },
};
