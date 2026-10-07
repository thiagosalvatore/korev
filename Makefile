APP_DIR := korev-desktop
ARCH := $(shell node -p process.arch)
APP := $(APP_DIR)/out/Korev-darwin-$(ARCH)/Korev.app
PACKAGED_KOREV := Korev\.app/Contents/MacOS/Korev$$

.PHONY: package stop run package-run

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
