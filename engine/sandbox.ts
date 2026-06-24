import { spawn } from 'node:child_process';
import { mkdtemp, cp, rm, readdir } from 'node:fs/promises';
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

// Copy every file in srcDir into a fresh sandbox, then add any extraFiles.
export async function createSandboxFromDir(
  srcDir: string,
  extraFiles: { src: string; dest: string }[] = []
): Promise<{ dir: string; cleanup: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'parity-'));
  const entries = await readdir(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile()) {
      await cp(join(srcDir, entry.name), join(dir, entry.name));
    }
  }
  for (const { src, dest } of extraFiles) {
    await cp(src, join(dir, dest));
  }
  return {
    dir,
    cleanup: () => rm(dir, { recursive: true, force: true }),
  };
}

// GnuCOBOL needs COB_CONFIG_DIR etc. and its DLL bin in PATH.
// These are set as user env vars but may not be in the current session's process.env yet.
// Windows-only: on macOS/Linux a Homebrew/apt cobc resolves its own config; the Windows
// chocolatey paths below would otherwise poison the child env and break compilation.
function cobEnv(): Partial<NodeJS.ProcessEnv> {
  if (process.platform !== 'win32') return {};
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

// ── Sandbox resource limits (uploaded code is untrusted) ──────────────────────
const LIMITS = {
  virtualMemKB: 2 * 1024 * 1024, // 2 GB address space
  cpuSeconds: 60,                // CPU time (wall-time is enforced separately)
  fileSizeKB: 512 * 1024,        // 512 MB max single output file
  maxProcs: 256,                 // fork-bomb guard
};
const MAX_OUTPUT_BYTES = 32 * 1024 * 1024; // cap captured stdout/stderr (output-flood guard)

// Minimal environment for untrusted children. NEVER forward the worker's secrets
// (DATABASE_URL, OPENAI_API_KEY, AWS_*, VERCEL_*) — only what cobc/python need to run.
function childEnv(): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH,
    HOME: process.env.HOME ?? '/tmp',
    LANG: process.env.LANG ?? 'C.UTF-8',
    TMPDIR: process.env.TMPDIR,
    ...cobEnv(),
  } as NodeJS.ProcessEnv;
}

function shellQuote(arg: string): string {
  return `'${arg.replace(/'/g, `'\\''`)}'`;
}

// POSIX: apply ulimits in the same shell before exec'ing the command. Optionally
// drop network via `unshare -n` when PARITY_SANDBOX_UNSHARE=1 and it is available.
function buildPosixCommand(rawCmd: string): string {
  const limits =
    `ulimit -v ${LIMITS.virtualMemKB} 2>/dev/null; ` +
    `ulimit -t ${LIMITS.cpuSeconds} 2>/dev/null; ` +
    `ulimit -f ${LIMITS.fileSizeKB} 2>/dev/null; ` +
    `ulimit -u ${LIMITS.maxProcs} 2>/dev/null; `;
  const inner = process.env.PARITY_SANDBOX_UNSHARE === '1' ? `unshare -n -- sh -c ${shellQuote(rawCmd)}` : rawCmd;
  return `${limits}${inner}`;
}

function execHardened(dir: string, rawCmd: string, timeoutMs: number): Promise<CommandResult> {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const isWindows = process.platform === 'win32';
    const argv: [string, string[]] = isWindows
      ? ['cmd', ['/c', rawCmd]]
      : ['sh', ['-c', buildPosixCommand(rawCmd)]];

    const child = spawn(argv[0], argv[1], {
      cwd: dir,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: childEnv(),
      detached: !isWindows, // own process group so we can SIGKILL grandchildren (cobcrun/python)
    });

    let stdout = '';
    let stderr = '';
    let killed: string | null = null;

    const killTree = (reason: string) => {
      if (killed) return;
      killed = reason;
      try {
        if (!isWindows && child.pid) process.kill(-child.pid, 'SIGKILL');
        else child.kill('SIGKILL');
      } catch { /* already gone */ }
    };

    const timer = setTimeout(() => killTree(`wall-time limit ${timeoutMs}ms exceeded`), timeoutMs);

    const onData = (which: 'out' | 'err') => (d: Buffer) => {
      if (which === 'out') stdout += d.toString(); else stderr += d.toString();
      if (stdout.length + stderr.length > MAX_OUTPUT_BYTES) killTree('output limit exceeded');
    };
    child.stdout.on('data', onData('out'));
    child.stderr.on('data', onData('err'));

    child.on('close', (code) => {
      clearTimeout(timer);
      if (killed) stderr += `\n[sandbox] terminated: ${killed}`;
      resolve({ stdout, stderr, exitCode: killed ? 137 : code, execMs: Date.now() - start });
    });
    child.on('error', (err) => { clearTimeout(timer); reject(err); });
  });
}

// Trusted internal invocation by argv (e.g. our own `cobc` compile). Still runs
// under the same resource limits + scrubbed env on POSIX.
export function runCommand(
  dir: string,
  cmd: string[],
  timeoutMs = 120_000
): Promise<CommandResult> {
  const rawCmd = cmd.map(shellQuote).join(' ');
  return execHardened(dir, rawCmd, timeoutMs);
}

// Run a user-supplied shell command string (may contain &&, pipes, etc.) — untrusted.
export function runShellCommand(
  dir: string,
  cmd: string,
  timeoutMs = 120_000
): Promise<CommandResult> {
  return execHardened(dir, cmd, timeoutMs);
}
