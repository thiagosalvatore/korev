APP_DIR := korev-desktop
ARCH := $(shell node -p process.arch)
APP := $(APP_DIR)/out/Korev-darwin-$(ARCH)/Korev.app

.PHONY: package run package-run

$(APP_DIR)/node_modules: $(APP_DIR)/package-lock.json
	cd $(APP_DIR) && npm ci
	touch $@

package: $(APP_DIR)/node_modules
	cd $(APP_DIR) && npm run package

run:
	open -n $(APP)

package-run: package run
