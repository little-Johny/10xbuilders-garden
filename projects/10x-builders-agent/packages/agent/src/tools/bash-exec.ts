import { execFile } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import { resolve } from "node:path";

const BASH_TIMEOUT_MS = 120_000;
const BASH_MAX_OUTPUT = 100_000;

export interface BashResult {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  cwd?: string;
  truncated?: true;
  timedOut?: true;
}

export function isBashToolAllowed(): boolean {
  const v = process.env.ALLOW_BASH_TOOL;
  return v === "true" || v === "1";
}

export async function runBash(command: string, cwd?: string): Promise<BashResult> {
  if (process.platform === "win32") {
    throw new Error("La tool bash solo está soportada en sistemas unix-like.");
  }
  if (!existsSync("/bin/bash")) {
    throw new Error("/bin/bash no está disponible en este sistema.");
  }

  let resolvedCwd: string | undefined;
  if (cwd && cwd.length > 0) {
    resolvedCwd = resolve(cwd);
    if (!existsSync(resolvedCwd) || !statSync(resolvedCwd).isDirectory()) {
      throw new Error(`cwd no existe o no es un directorio: ${resolvedCwd}`);
    }
    const root = process.env.BASH_WORKSPACE_ROOT;
    if (root) {
      const resolvedRoot = resolve(root);
      if (!resolvedCwd.startsWith(resolvedRoot)) {
        throw new Error("cwd fuera del root permitido (BASH_WORKSPACE_ROOT).");
      }
    }
  }

  return await new Promise<BashResult>((resolveP) => {
    const child = execFile(
      "/bin/bash",
      ["-lc", command],
      {
        cwd: resolvedCwd,
        timeout: BASH_TIMEOUT_MS,
        maxBuffer: BASH_MAX_OUTPUT * 4,
      },
      (err, stdout, stderr) => {
        let out = String(stdout ?? "");
        let errOut = String(stderr ?? "");
        let truncated: true | undefined;
        if (out.length > BASH_MAX_OUTPUT) {
          out = out.slice(0, BASH_MAX_OUTPUT) + "\n[...stdout truncated]";
          truncated = true;
        }
        if (errOut.length > BASH_MAX_OUTPUT) {
          errOut = errOut.slice(0, BASH_MAX_OUTPUT) + "\n[...stderr truncated]";
          truncated = true;
        }
        const errAny = err as (NodeJS.ErrnoException & { killed?: boolean }) | null;
        const timedOut =
          errAny && (errAny.code === "ETIMEDOUT" || errAny.killed === true)
            ? true
            : undefined;
        resolveP({
          stdout: out,
          stderr: errOut,
          exitCode: child.exitCode,
          cwd: resolvedCwd,
          truncated,
          timedOut,
        });
      },
    );
  });
}
