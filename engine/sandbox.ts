import { spawn } from 'node:child_process';
import { mkdtemp, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  execMs: number;
}

export async function createSandbox(
  files: { src: string; dest: string }[]
): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'parity-'));
  for (const { src, dest } of files) {
    await cp(src, join(dir, dest));
  }
  return {
    dir,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

// GnuCOBOL needs COB_CONFIG_DIR etc. and its DLL bin in PATH.
// These are set as user env vars but may not be in the current session's process.env yet.
function cobEnv(): Partial<NodeJS.ProcessEnv> {
  const cobBase = 'C:\\ProgramData\\chocolatey\\lib\\gnucobol\\tools';
  const python  = 'C:\\Users\\tyler\\AppData\\Local\\Programs\\Python\\Python313';
  const extra = [cobBase + '\\bin', python].filter(
    (p) => !(process.env.PATH ?? '').includes(p)
  );
  return {
    COB_CONFIG_DIR:   process.env.COB_CONFIG_DIR   ?? `${cobBase}\\config`,
    COB_COPY_DIR:     process.env.COB_COPY_DIR     ?? `${cobBase}\\copy`,
    COB_INCLUDE_PATH: process.env.COB_INCLUDE_PATH ?? `${cobBase}\\include`,
    COB_LIBRARY_PATH: process.env.COB_LIBRARY_PATH ?? `${cobBase}\\lib`,
    PATH: extra.length ? extra.join(';') + ';' + (process.env.PATH ?? '') : process.env.PATH,
  };
}

export function runCommand(
  dir: string,
  cmd: string[],
  timeoutMs = 120_000
): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const child = spawn(cmd[0], cmd.slice(1), {
      cwd: dir,
      timeout: timeoutMs,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...cobEnv() },
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr.on('data', (d: Buffer) => { stderr += d.toString(); });

    child.on('close', (code) => {
      resolve({ stdout, stderr, exitCode: code, execMs: Date.now() - start });
    });
    child.on('error', reject);
  });
}
