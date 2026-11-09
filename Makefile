# SPDX-License-Identifier: AGPL-3.0-only
NODE ?= node
SOURCES := $(wildcard src/js/*.js) src/js/build-parser.mjs
NOTICE := LICENSE-CROSSNOTE

.PHONY: all watch

all: parser.js

parser.js: $(SOURCES) $(NOTICE) Makefile
	$(NODE) src/js/build-parser.mjs

watch:
	$(NODE) src/js/build-parser.mjs --watch
