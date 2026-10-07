APP_DIR := korev-desktop
ARCH := $(shell node -p process.arch)
APP := $(APP_DIR)/out/Korev-darwin-$(ARCH)/Korev.app
PACKAGED_KOREV := Korev\.app/Contents/MacOS/Korev$$
DOCS_PORT ?= 4000

.PHONY: package stop run package-run docs

$(APP_DIR)/node_modules: $(APP_DIR)/package-lock.json
	cd $(APP_DIR) && npm ci
	touch $@

package: $(APP_DIR)/node_modules
	cd $(APP_DIR) && npm run package

stop:
	-pkill -f '$(PACKAGED_KOREV)'
	while pgrep -f '$(PACKAGED_KOREV)' >/dev/null; do sleep 0.2; done

run: stop
	open -n $(APP)

package-run: package run

docs:
	docker run --rm -it -v "$(CURDIR)/docs:/site:ro" -p $(DOCS_PORT):4000 ruby:3.3 bash -c \
		'gem install --no-document github-pages webrick && cd /tmp && jekyll serve --source /site --host 0.0.0.0 --baseurl /korev --destination /tmp/site'
