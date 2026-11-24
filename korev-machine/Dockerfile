FROM node:24-bookworm AS build
WORKDIR /src
COPY korev-desktop/package.json korev-desktop/package-lock.json ./
RUN ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm ci --ignore-scripts --no-audit --no-fund
COPY korev-desktop/ ./
RUN npm run build:headless

FROM ubuntu:24.04
COPY korev-machine/install.sh /tmp/install.sh
RUN bash /tmp/install.sh && rm /tmp/install.sh
WORKDIR /opt/korev
COPY korev-desktop/package.json ./
RUN npm install --no-save --no-audit --no-fund --ignore-scripts \
    "node-pty@$(node -p "require('./package.json').dependencies['node-pty']")"
COPY korev-desktop/cli cli
COPY --from=build /src/.vite/build/headless.cjs .vite/build/headless.cjs
COPY korev-machine/entrypoint.sh /usr/local/bin/korev-entrypoint
COPY korev-machine/fly-suspend.sh /usr/local/bin/korev-fly-suspend
ENV KOREV_REMOTE_HOST=0.0.0.0
EXPOSE 7420
ENTRYPOINT ["tini", "-s", "--", "korev-entrypoint"]
