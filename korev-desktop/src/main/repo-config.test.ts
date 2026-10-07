import { describe, expect, it } from 'vitest';
import { EMPTY_SCRIPTS } from '../shared/model';
import { expandPort, resolveRepoConfig } from './repo-config';

const APP = {
  scripts: {
    ...EMPTY_SCRIPTS,
    setup: 'app-setup',
    run: [{ name: 'run', command: 'app-run' }],
  },
  prompts: {},
};
const NO_FILES = {
  sharedToml: null,
  localToml: null,
  jsonConfig: null,
  conductorSharedToml: null,
  conductorLocalToml: null,
};

const SHARED = `
file_include_globs = ".env*\\nconfig/*.local.json"

[scripts]
setup = "pnpm install"
archive = "./archive.sh"
run_mode = "nonconcurrent"

[scripts.run.web]
command = "pnpm dev"
args = ["--port", "$KOREV_PORT"]
options = { cwd = "apps/web" }
icon = "globe"

[scripts.run.api]
command = "pnpm api"
default = true

[scripts.run.cloud-only]
command = "deploy"
available_in = "cloud"

[[preview_urls]]
name = "Web"
url = "http://localhost:$KOREV_PORT"

[environment_variables]
API_URL = "http://localhost:3000"
[environment_variables.local]
DEBUG = "1"

[prompts]
create_pr = "Use the PR template."

[git]
archive_on_merge = true
branch_prefix_type = "custom"
branch_prefix = "agent"
`;

describe('repo config', () => {
  it('reads .korev/settings.toml and ignores the app scripts', () => {
    const config = resolveRepoConfig(APP, { ...NO_FILES, sharedToml: SHARED });
    expect(config).toMatchObject({
      source: 'settings.toml',
      setup: 'pnpm install',
      archive: './archive.sh',
      runMode: 'nonconcurrent',
      fileIncludeGlobs: '.env*\nconfig/*.local.json',
      previewUrls: [{ name: 'Web', url: 'http://localhost:$KOREV_PORT' }],
      environment: { API_URL: 'http://localhost:3000', DEBUG: '1' },
      prompts: { create_pr: 'Use the PR template.' },
      archiveOnMerge: true,
      branchPrefix: 'agent',
    });
    expect(config.runScripts).toEqual([
      {
        id: 'web',
        command: 'pnpm dev --port $KOREV_PORT',
        cwd: 'apps/web',
        icon: 'globe',
        isDefault: false,
      },
      {
        id: 'api',
        command: 'pnpm api',
        cwd: null,
        icon: 'play',
        isDefault: true,
      },
    ]);
  });

  it('lets settings.local.toml override and hide shared scripts', () => {
    const localToml =
      '[scripts]\nsetup = "npm ci"\n[scripts.run.web]\nhide = true\n';
    const config = resolveRepoConfig(APP, {
      ...NO_FILES,
      sharedToml: SHARED,
      localToml,
    });
    expect(config.setup).toBe('npm ci');
    expect(config.runScripts.map((script) => script.id)).toEqual(['api']);
  });

  it('falls back to korev.json, then to the app scripts', () => {
    const jsonConfig = JSON.stringify({
      scripts: { setup: 'npm ci', run: 'npm start' },
      runScriptMode: 'nonconcurrent',
    });
    expect(resolveRepoConfig(APP, { ...NO_FILES, jsonConfig })).toMatchObject({
      source: 'korev.json',
      setup: 'npm ci',
      runMode: 'nonconcurrent',
      runScripts: [{ id: 'run', command: 'npm start', isDefault: true }],
    });
    expect(resolveRepoConfig(APP, NO_FILES)).toMatchObject({
      source: 'app',
      setup: 'app-setup',
      runScripts: [{ id: 'run', command: 'app-run' }],
    });
  });

  it('resolves every named app run script, with the first as the default', () => {
    const app = {
      ...APP,
      scripts: {
        ...EMPTY_SCRIPTS,
        run: [
          { name: 'backend', command: 'make api' },
          { name: 'blank', command: '  ' },
          { name: 'frontend', command: 'pnpm dev' },
        ],
      },
    };
    expect(resolveRepoConfig(app, NO_FILES).runScripts).toEqual([
      {
        id: 'backend',
        command: 'make api',
        cwd: null,
        icon: 'play',
        isDefault: true,
      },
      {
        id: 'frontend',
        command: 'pnpm dev',
        cwd: null,
        icon: 'play',
        isDefault: false,
      },
    ]);
  });

  it('reads several run scripts from a korev.json table', () => {
    const jsonConfig = JSON.stringify({
      scripts: {
        run: {
          web: { command: 'pnpm dev' },
          api: { command: 'pnpm api', default: true },
        },
      },
    });
    expect(
      resolveRepoConfig(APP, { ...NO_FILES, jsonConfig }).runScripts,
    ).toMatchObject([
      { id: 'web', command: 'pnpm dev', isDefault: false },
      { id: 'api', command: 'pnpm api', isDefault: true },
    ]);
  });

  it('uses the prompts saved in the app unless the repository sets its own', () => {
    const app = {
      ...APP,
      prompts: { code_review: 'Use the pr-review skill.', create_pr: 'Short.' },
    };
    expect(resolveRepoConfig(app, NO_FILES).prompts).toEqual(app.prompts);
    expect(
      resolveRepoConfig(app, { ...NO_FILES, sharedToml: SHARED }).prompts,
    ).toEqual({
      code_review: 'Use the pr-review skill.',
      create_pr: 'Use the PR template.',
    });
  });

  it('falls back to .conductor/settings.toml when .korev has no settings', () => {
    const conductorLocalToml = '[scripts]\nsetup = "direnv allow"\n';
    expect(
      resolveRepoConfig(APP, {
        ...NO_FILES,
        conductorSharedToml: SHARED,
        conductorLocalToml,
      }),
    ).toMatchObject({
      source: 'conductor',
      setup: 'direnv allow',
      archive: './archive.sh',
    });
    expect(
      resolveRepoConfig(APP, {
        ...NO_FILES,
        sharedToml: SHARED,
        conductorLocalToml,
      }),
    ).toMatchObject({ source: 'settings.toml', setup: 'pnpm install' });
  });

  it('expands port placeholders in preview URLs', () => {
    expect(expandPort('http://localhost:$KOREV_PORT/a', 55010)).toBe(
      'http://localhost:55010/a',
    );
    expect(expandPort('http://localhost:$((KOREV_PORT + 1))', 55010)).toBe(
      'http://localhost:55011',
    );
  });
});
