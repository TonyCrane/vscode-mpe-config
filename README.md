# Markdown Preview Enhanced 配置

默认配置位于 `~/.local/state/crossnote/`

- `style.less` 按顺序加载 `src/css/` 中的 Less 模块
- `config.js` 配置数学公式与 Mermaid
- `parser.js` 为 Makefile 自动生成的 mpe 入口

`parser.js` 需要利用 Node.js 和 make 合成，使用前需要在本目录执行：

```sh
make         # 构建 parser.js
make watch   # 监听解析器源码并自动构建
```

## 许可

本项目新增代码采用 [GNU Affero General Public License v3.0](LICENSE)

MPE/Crossnote 配置模板保留 [NCSA 许可](LICENSE-CROSSNOTE)
