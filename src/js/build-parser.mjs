// SPDX-License-Identifier: AGPL-3.0-only
// 将本地 CommonJS 模块合并成 MPE 沙箱可读取的单个对象表达式
import { readFileSync, watch, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { Script } from "node:vm";

const sourceDirectory = dirname(fileURLToPath(import.meta.url));
const projectDirectory = resolve(sourceDirectory, "../..");
const entryFile = resolve(sourceDirectory, "parser.js");
const outputFile = resolve(projectDirectory, "parser.js");
const noticeFile = resolve(projectDirectory, "LICENSE-CROSSNOTE");
let dependencies = new Set();

function moduleName(file) {
  const name = relative(sourceDirectory, file);
  if (name === ".." || name.startsWith(`..${sep}`)) {
    throw new Error("解析器模块须位于 src/js 目录内");
  }

  return name.split(sep).join("/");
}

function collectModules(entry) {
  const modules = new Map();

  function load(file) {
    const name = moduleName(file);
    if (modules.has(name)) {
      return name;
    }

    modules.set(name, "");

    const source = readFileSync(file, "utf8");
    const imports = /\brequire\(\s*(["'])(\.\.?\/[^"']+)\1\s*\)/g;
    const bundledSource = source.replace(imports, (call, quote, request) => {
      const dependency = resolve(dirname(file), request);
      const dependencyName = load(dependency);
      return `require(${JSON.stringify(dependencyName)})`;
    });

    modules.set(name, bundledSource);
    return name;
  }

  const entryName = load(entry);
  return { modules, entryName };
}

function indent(source, spaces) {
  const prefix = " ".repeat(spaces);

  return source
    .trimEnd()
    .split("\n")
    .map((line) => (line ? prefix + line : ""))
    .join("\n");
}

function renderModules(modules) {
  return [...modules]
    .map(([name, source]) => {
      return `    ${JSON.stringify(name)}: function (module, exports, require) {
${indent(source, 6)}
    }`;
    })
    .join(",\n");
}

function renderUpstreamNotice() {
  const license = readFileSync(noticeFile, "utf8");
  return `LICENSE-CROSSNOTE\n\n${license.trimEnd()}`;
}

function renderParser(modules, entryName) {
  return `// SPDX-License-Identifier: AGPL-3.0-only AND NCSA
// 自动生成，源码入口：src/js/parser.js；构建命令：make
/*
上游模板的版权、许可条件及免责声明：

${renderUpstreamNotice()}
*/
(() => {
  const modules = {
${renderModules(modules)}
  };

  const cache = Object.create(null);

  function require(name) {
    if (cache[name]) {
      return cache[name].exports;
    }

    if (!Object.prototype.hasOwnProperty.call(modules, name)) {
      throw new Error("未知模块：" + name);
    }

    const module = { exports: {} };
    cache[name] = module;
    modules[name](module, module.exports, require);
    return module.exports;
  }

  return require(${JSON.stringify(entryName)});
})()
`;
}

function buildParser() {
  const { modules, entryName } = collectModules(entryFile);
  const output = renderParser(modules, entryName);

  // 全部源码加载和语法检查完成后，再写入 MPE 使用的文件
  new Script(output, { filename: outputFile });
  writeFileSync(outputFile, output);
  dependencies = new Set(modules.keys());
  console.log("已生成 parser.js");
}

function watchSources() {
  let pending;

  function scheduleBuild() {
    clearTimeout(pending);
    pending = setTimeout(() => {
      try {
        buildParser();
      } catch (error) {
        console.error(error);
      }
    }, 100);
  }

  watch(sourceDirectory, (event, filename) => {
    if (dependencies.has(filename)) {
      scheduleBuild();
    }
  });

  watch(projectDirectory, (event, filename) => {
    if (filename === "LICENSE-CROSSNOTE") {
      scheduleBuild();
    }
  });

  console.log("正在监听 src/js 中的解析器模块及上游许可文件");
}

buildParser();

if (process.argv.includes("--watch")) {
  watchSources();
}
