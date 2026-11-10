#!/usr/bin/env python3
# SPDX-License-Identifier: AGPL-3.0-only
# 生成 src/js/material-data.js
#
# 按键表来自 pymdownx，图标来自 mkdocs-material。图标全集上万个，放不进 QuickJS 沙箱，
# 所以只收录笔记里实际用到的。新用了某个图标、预览里显示原文时，重跑一次再 make：
#   python3 -I src/js/build-material-data.py 笔记目录 [更多目录...] && make
import glob
import html
import json
import os
import re
import runpy
import sys

SITE_PACKAGES = "~/.local/share/uv/tools/mkdocs/lib/python*/site-packages"
ICON = re.compile(r":((?:material|fontawesome|octicons|simple)-[\w-]+):")
SKIPPED_DIRS = {".git", "node_modules", "site", ".venv", ".cache"}


def note_roots():
    # 目录来自命令行参数，或 .material-roots（一行一个）
    if len(sys.argv) > 1:
        return sys.argv[1:]

    repository = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    with open(os.path.join(repository, ".material-roots"), encoding="utf8") as roots:
        return [line.strip() for line in roots if line.strip()]


def used_icons():
    names = set()
    for root in note_roots():
        for folder, dirs, files in os.walk(os.path.expanduser(root)):
            dirs[:] = [d for d in dirs if d not in SKIPPED_DIRS]
            for file in files:
                if file.endswith(".md"):
                    with open(os.path.join(folder, file), encoding="utf8") as source:
                        names.update(ICON.findall(source.read()))
    return names


def icon_path(name):
    prefix, _, rest = name.partition("-")
    if prefix == "fontawesome":
        style, _, rest = rest.partition("-")
        return os.path.join(prefix, style, rest + ".svg")
    return os.path.join(prefix, rest + ".svg")


def main():
    packages = os.environ.get("MKDOCS_SITE_PACKAGES") or glob.glob(os.path.expanduser(SITE_PACKAGES))[0]
    database = runpy.run_path(os.path.join(packages, "pymdownx", "keymap_db.py"))

    icons = {}
    for name in sorted(used_icons()):
        path = os.path.join(packages, "material", "templates", ".icons", icon_path(name))
        if not os.path.exists(path):
            print("没有这个图标，跳过：", name)
            continue
        with open(path, encoding="utf8") as source:
            icons[name] = source.read().strip()

    data = {
        "keys": {key: html.escape(label, quote=False) for key, label in database["keymap"].items()},
        "aliases": database["aliases"],
        "icons": icons,
    }
    target = os.path.join(os.path.dirname(os.path.abspath(__file__)), "material-data.js")
    with open(target, "w", encoding="utf8") as output:
        output.write("// 自动生成：python3 -I src/js/build-material-data.py\n")
        output.write("// 按键表来自 PyMdown Extensions（MIT），图标来自 mkdocs-material 打包的图标集\n")
        output.write("module.exports = " + json.dumps(data, ensure_ascii=False, sort_keys=True) + ";\n")
    print("已生成 material-data.js，图标：", ", ".join(icons))


main()
