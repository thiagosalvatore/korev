APP_DIR := korev-desktop
ARCH := $(shell node -p process.arch)
APP := $(APP_DIR)/out/Korev-darwin-$(ARCH)/Korev.app
PACKAGED_KOREV := Korev\.app/Contents/MacOS/Korev$$
VERSION ?= $(shell node -p "require('./$(APP_DIR)/package.json').version")
TAG = v$(VERSION)
DIST_ARCHS := arm64 x64
DMG_DIR := $(APP_DIR)/out/make/dmg
ZIP_DIR := $(APP_DIR)/out/make/zip/darwin
WHISPER_VERSION = $(shell node -p "require('./$(APP_DIR)/package-lock.json').packages['node_modules/@fugood/whisper.node'].version")
WHISPER_BINARIES := $(DIST_ARCHS:%=$(APP_DIR)/node_modules/@fugood/node-whisper-darwin-%)
RELEASE_NOTES = awk -v heading='\#\# [$(VERSION)]' 'index($$0, "\#\# ") == 1 { printing = index($$0, heading) == 1; next } printing' CHANGELOG.md

.PHONY: package stop run package-run dist release-notes bump release testflight android-apk

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

$(APP_DIR)/node_modules/@fugood/node-whisper-darwin-%: | $(APP_DIR)/node_modules
	mkdir -p $@
	cd $@ && tarball=$$(npm pack --silent @fugood/node-whisper-darwin-$*@$(WHISPER_VERSION)) && tar -xzf $$tarball --strip-components=1 && rm $$tarball

dist: $(APP_DIR)/node_modules $(WHISPER_BINARIES)
	rm -rf $(APP_DIR)/out/make
	for arch in $(DIST_ARCHS); do \
		(cd $(APP_DIR) && npm run make -- --arch=$$arch) || exit 1; \
		mv $(DMG_DIR)/$$arch/Korev-$(VERSION)-$$arch.dmg $(DMG_DIR)/$$arch/Korev-$$arch.dmg || exit 1; \
		mv $(ZIP_DIR)/$$arch/RELEASES.json $(ZIP_DIR)/$$arch/RELEASES-darwin-$$arch.json || exit 1; \
	done

release-notes:
	@$(RELEASE_NOTES)

bump:
	@test "$(origin VERSION)" = "command line" || { echo "Usage: make bump VERSION=x.y.z"; exit 1; }
	cd $(APP_DIR) && npm version $(VERSION) --no-git-tag-version --allow-same-version
	perl -0pi -e 's/^\#\# \[Unreleased\]$$/\#\# [Unreleased]\n\n\#\# [$(VERSION)] - $(shell date +%F)/m' CHANGELOG.md

release:
	@test "$$(git branch --show-current)" = main || { echo "Run make release on main."; exit 1; }
	@test -z "$$(git status --porcelain)" || { echo "Commit or stash your changes first."; exit 1; }
	git fetch origin main --tags
	@test "$$(git rev-parse HEAD)" = "$$(git rev-parse origin/main)" || { echo "Your main is not the same as origin/main. Pull or push first."; exit 1; }
	@! git rev-parse -q --verify "refs/tags/$(TAG)" >/dev/null || { echo "$(TAG) already exists."; exit 1; }
	@$(RELEASE_NOTES) | grep -q '[^[:space:]]' || { echo "CHANGELOG.md has no notes under [$(VERSION)]. Run make bump VERSION=$(VERSION) first."; exit 1; }
	git tag -s $(TAG) -m "Korev $(VERSION)"
	git push origin $(TAG)

testflight:
	cd korev-mobile && npx eas-cli@latest build -p ios --profile production --auto-submit --non-interactive

android-apk:
	cd korev-mobile && npx eas-cli@latest build -p android --profile preview --non-interactive
