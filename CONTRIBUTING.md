# Contributing to Korev

Thanks for helping out. This file covers how to send a change, how to run every part of the repository, and how a release goes out. For things to work on, see [`TODOS.md`](TODOS.md).

- [Pull requests](#pull-requests)
- [Requirements](#requirements)
- [Run the desktop app](#run-the-desktop-app)
- [Run the phone app](#run-the-phone-app)
- [Run the landing page](#run-the-landing-page)
- [Package it](#package-it)
- [Project layout](#project-layout)
- [Checks](#checks)
- [Release a new version](#release-a-new-version)

## Pull requests

1. Make a branch from `main`. Do not commit to `main`.
2. Keep each pull request to one change. Put dependent work in a second pull request on top of the first.
3. Put unit tests next to the code they test (`foo.ts` and `foo.test.ts`). Add an e2e test when a flow goes across several screens.
4. Follow [`DESIGN.md`](DESIGN.md) for UI changes: semantic tokens only, one accent colour.
5. Add a line under `## [Unreleased]` in [`CHANGELOG.md`](CHANGELOG.md) when you change what the user sees. Korev shows these notes after an update.
6. Run the [checks](#checks), then start CI on your branch.
7. Update the docs in `korev-frontend/content/docs` when you change what the user sees. To preview them, run `npm run dev` in `korev-frontend` and open `/docs`. If you change a screen that the docs show, run `npm run docs:screenshots` in `korev-desktop` to take the screenshots again.
8. Write the commit and pull request title as one sentence that says what the user sees change, for example "Keep the Mac awake while an agent is running". Pull requests are squash-merged.

## Requirements

- macOS.
- Node 24 and npm, the versions CI uses.
- Go, the version in `korev-desktop/tailnet/go.mod`. The build compiles Korev's Tailscale device from it.
- The `claude` and `codex` CLIs on your PATH, signed in. Korev uses their own sign-in. You need only the agents you plan to use.
- `gh`, signed in. Korev uses it for pull requests, issues and checks.

## Run the desktop app

```sh
cd korev-desktop
npm ci
npm start
```

`npm start` runs Korev in development mode with Electron Forge and Vite. Changes to the renderer (`src/app`) reload in the window. Changes to the main process (`src/main`) need a restart: type `rs` in the terminal that runs `npm start`.

Korev keeps its state in `~/Library/Application Support/Korev`: `korev-state.json`, chat transcripts in `transcripts/`, and repositories added with **Clone from URL** in `repos/`. Workspaces and the shared Ask checkouts live in `~/korev/workspaces` (Settings → Storage). The development build keeps its own state in `~/Library/Application Support/Korev Dev`, so it can run next to the packaged app. It starts empty: add your repositories again in the development build.

## Run the phone app

`korev-mobile` is the phone app, built with [Expo](https://expo.dev). It uses Korev on your Mac through remote access, over Tailscale.

```sh
cd korev-mobile
npm ci
REACT_NATIVE_PACKAGER_HOSTNAME=<tailscale-ip> npx expo start
```

Open the app with Expo Go on your phone, then pair it from Settings → Remote access. See [Use Korev from your phone](https://korev.ai/docs/guides/use-korev-from-your-phone).

`make testflight` builds the iOS app with [EAS](https://expo.dev/eas) and uploads it to TestFlight. The first time, run `npx eas-cli@latest login`, then run the same build without `--non-interactive` from `korev-mobile`, so EAS can sign in to Apple and create the signing certificate and provisioning profile.

`make play-internal` builds the Android app bundle and uploads it to the internal testing track on Google Play. Before the first run, upload one bundle by hand in the Play Console, because Google Play accepts uploads from the API only for an app that already has a release. Then add a Google service account key with `npx eas-cli@latest credentials -p android`, under **Google Service Account**, so EAS can upload for you.

`make android-apk` builds an Android APK and prints a link to install it. The first time, run the same build without `--non-interactive`, so EAS can create the Android keystore.

## Run the landing page

`korev-frontend` is the marketing site, built with [Next.js](https://nextjs.org). `next build` writes a static site to `korev-frontend/out/`.

```sh
cd korev-frontend
npm ci
npm run dev        # http://localhost:3000, or $KOREV_PORT inside a Korev workspace
npm run build
```

## Package it

From the repository root:

```sh
make package       # builds korev-desktop/out/Korev-darwin-<arch>/Korev.app
make run           # quits the packaged Korev if it is running, then opens the build
make package-run   # both
```

To build what a release ships, run `make dist`. It writes a DMG and a zip for Apple silicon (`arm64`) and Intel (`x64`) under `korev-desktop/out/make/`. The DMGs are named `Korev-arm64.dmg` and `Korev-x64.dmg`, with no version, so the landing page can link to `releases/latest/download/Korev-<arch>.dmg`.

To sign the build with a Developer ID and notarize it, set `APPLE_API_KEY` (the path to an App Store Connect API key `.p8`), `APPLE_API_KEY_ID` and `APPLE_API_ISSUER` first. The "Developer ID Application" certificate must be in your keychain. The release workflow does this. Without these variables the build is signed ad hoc, so Gatekeeper blocks it on other Macs. To open an ad hoc build there, open it once, then go to System Settings → Privacy & Security and click Open Anyway. Or run `xattr -dr com.apple.quarantine /Applications/Korev.app`.

To change the app icon, edit `korev-desktop/assets/icon.svg` and run `npm run icons`. It needs `rsvg-convert` and ImageMagick (`brew install librsvg imagemagick`).

## Project layout

| Path | What it holds |
| --- | --- |
| `korev-desktop/src/main` | Electron main process: git, worktrees, agents, pull requests, the state store |
| `korev-desktop/src/app` | React renderer: sidebar, workspace view, chat, settings |
| `korev-desktop/src/shared` | The API between the main process and the renderer, and the types both use |
| `korev-desktop/src/design-system` | Tokens, styles and shared UI components |
| `korev-mobile` | The phone app (Expo and React Native). It imports the types in `korev-desktop/src/shared` |
| `korev-frontend` | The landing page and the docs site (Next.js and Fumadocs). The docs pages are in `korev-frontend/content/docs` |
| `korev-desktop/e2e` | Playwright tests that drive the packaged app |
| `korev-desktop/test-support/bin/claude` | The fake `claude` CLI that the e2e tests run |
| `DESIGN.md` | How the app looks and behaves |
| `TODOS.md` | Features Korev does not have yet |
| `CHANGELOG.md` | What changed in each release. The release notes come from it |

## Checks

Run these in `korev-desktop`:

```sh
npm run typecheck   # tsc
npm run lint        # oxlint and oxfmt; npm run lint:fix applies the fixes
npm test            # Vitest unit tests
npm run test:e2e    # packages the app and drives it with a fake agent
```

`korev-mobile` and `korev-frontend` have the same `typecheck`, `lint` and `test` scripts. `korev-frontend` also has `build`.

CI runs the same checks, but only when you start it by hand:

```sh
gh workflow run ci.yml --ref <branch>
```

## Release a new version

A release is a tag `vX.Y.Z` on `main`. Pushing the tag starts `.github/workflows/release.yml`. It runs CI, builds the DMGs and zips with `make dist`, and publishes a GitHub release. The release notes are the `## [X.Y.Z]` section of `CHANGELOG.md`.

1. On a new branch, run `make bump VERSION=X.Y.Z`. It sets the version in `korev-desktop/package.json` and renames `## [Unreleased]` in `CHANGELOG.md` to `## [X.Y.Z] - <today>`. Read the notes and edit them if you need to.
2. Open a pull request with the two files and merge it.
3. On `main`, pull, then run `make release`. It checks that `main` is clean and the same as `origin/main`, that the tag does not exist and that `CHANGELOG.md` has notes for the version. Then it signs the tag and pushes it.
4. Follow the run with `gh run watch`. The release appears at https://github.com/thiagosalvatore/korev/releases.

`make release-notes` prints the notes for the version in `package.json`. Add `VERSION=X.Y.Z` to print another version.

To try the workflow without a real release, use a version with a suffix, for example `1.2.0-rc.1`. Run `make bump VERSION=1.2.0-rc.1` on a branch, commit, then push a tag from that branch:

```sh
git tag v1.2.0-rc.1 && git push origin v1.2.0-rc.1
```

A version with a `-` becomes a pre-release, which Korev does not offer as an update. To remove a release that went wrong, delete it and its tag, then tag again:

```sh
gh release delete vX.Y.Z --cleanup-tag --yes
git tag -d vX.Y.Z
```
