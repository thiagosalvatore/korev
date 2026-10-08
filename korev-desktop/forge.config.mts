import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDMG } from '@electron-forge/maker-dmg';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerRpm } from '@electron-forge/maker-rpm';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import { execFile } from 'node:child_process';
import { cp } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

const ICON = 'assets/icon';
const APP_BUNDLE = 'Korev.app';
const AD_HOC_IDENTITY = '-';
const MICROPHONE_USAGE =
  'Korev uses the microphone to turn what you say into text.';

interface NativePackage {
  dir: string;
  runtimeFiles(platform: string, arch: string): string[];
}

const NATIVE_PACKAGES: NativePackage[] = [
  {
    dir: 'node_modules/node-pty',
    runtimeFiles: (platform, arch) => [
      'package.json',
      'lib',
      `prebuilds/${platform}-${arch}`,
    ],
  },
  {
    dir: 'node_modules/@fugood',
    runtimeFiles: (platform, arch) => [
      'whisper.node/package.json',
      'whisper.node/lib',
      `node-whisper-${platform}-${arch}`,
    ],
  },
];

async function copyNativePackages(
  buildPath: string,
  platform: string,
  arch: string,
) {
  for (const { dir, runtimeFiles } of NATIVE_PACKAGES) {
    for (const entry of runtimeFiles(platform, arch)) {
      await cp(path.join(dir, entry), path.join(buildPath, dir, entry), {
        recursive: true,
      });
    }
  }
}

async function signAppBundlesAdHoc(outputPaths: string[]) {
  for (const outputPath of outputPaths) {
    await promisify(execFile)('codesign', [
      '--force',
      '--deep',
      '--sign',
      AD_HOC_IDENTITY,
      path.join(outputPath, APP_BUNDLE),
    ]);
  }
}

function notaryCredentials() {
  const {
    APPLE_API_KEY: appleApiKey,
    APPLE_API_KEY_ID: appleApiKeyId,
    APPLE_API_ISSUER: appleApiIssuer,
  } = process.env;
  if (!appleApiKey || !appleApiKeyId || !appleApiIssuer) return undefined;
  return { appleApiKey, appleApiKeyId, appleApiIssuer };
}

const osxNotarize = notaryCredentials();

const config: ForgeConfig = {
  packagerConfig: {
    asar: {
      unpack: `**/{${NATIVE_PACKAGES.map(({ dir }) => dir).join(',')}}/**`,
    },
    icon: ICON,
    extendInfo: { NSMicrophoneUsageDescription: MICROPHONE_USAGE },
    ...(osxNotarize && { osxSign: {}, osxNotarize }),
  },
  rebuildConfig: {},
  hooks: {
    packageAfterCopy: (_config, buildPath, _electronVersion, platform, arch) =>
      copyNativePackages(buildPath, platform, arch),
    postPackage: async (_config, { platform, outputPaths }) => {
      if (platform === 'darwin' && !osxNotarize)
        await signAppBundlesAdHoc(outputPaths);
    },
  },
  makers: [
    new MakerSquirrel({ setupIcon: `${ICON}.ico` }),
    new MakerZIP({}, ['darwin']),
    new MakerDMG({ icon: `${ICON}.icns` }),
    new MakerRpm({ options: { icon: `${ICON}.png` } }),
    new MakerDeb({ options: { icon: `${ICON}.png` } }),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/whisper-worker.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
