import { promises as fsPromises } from "node:fs";
import path from "node:path";

const DEFAULT_MAX_BYTES = 1_000_000;

function getMaxBytes(): number {
  const v = process.env.FILE_TOOL_MAX_BYTES;
  if (!v) return DEFAULT_MAX_BYTES;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_MAX_BYTES;
}

export function isFileToolsAllowed(): boolean {
  const v = process.env.ALLOW_FILE_TOOLS;
  return v === "true" || v === "1";
}

export function getFileToolsRoot(): string | null {
  const v = process.env.FILE_TOOLS_WORKSPACE_ROOT;
  if (!v || v.trim().length === 0) return null;
  return path.resolve(v);
}

export type FileOpErrCode =
  | "OUT_OF_SANDBOX"
  | "REQUIRES_ABSOLUTE_PATH"
  | "FILE_NOT_FOUND"
  | "FILE_ALREADY_EXISTS"
  | "PARENT_DIR_NOT_FOUND"
  | "PATH_IS_DIRECTORY"
  | "PERMISSION_DENIED"
  | "MATCH_NOT_FOUND"
  | "MATCH_NOT_UNIQUE"
  | "INVALID_RANGE"
  | "FILE_TOO_LARGE"
  | "IO_ERROR";

export interface FileOpErr {
  ok: false;
  code: FileOpErrCode;
  message: string;
  details?: Record<string, unknown>;
}

export interface ReadFileOk {
  ok: true;
  path: string;
  content: string;
  total_lines: number;
  returned_lines: number;
  offset: number;
  truncated: boolean;
}

export interface WriteFileOk {
  ok: true;
  path: string;
  bytes_written: number;
}

export interface EditFileOk {
  ok: true;
  path: string;
  replacements: 1;
  bytes_written: number;
  snippet: string;
}

type ResolveOk = { ok: true; path: string };
type ResolveResult = ResolveOk | FileOpErr;

function isInside(child: string, parent: string): boolean {
  return child === parent || child.startsWith(parent + path.sep);
}

/**
 * Resuelve y valida un path. Bimodal según FILE_TOOLS_WORKSPACE_ROOT:
 * - con root: confina paths absolutos y relativos al sandbox; aplica realpath
 *   (sobre el archivo en `read`, sobre el padre en `write`) para cerrar bypass
 *   por symlinks internos que apunten fuera.
 * - sin root: solo absolutos; el alcance lo dictan los permisos del proceso.
 */
async function resolveSafePath(
  input: string,
  opts: { kind: "read" | "write" },
): Promise<ResolveResult> {
  if (typeof input !== "string" || input.length === 0) {
    return { ok: false, code: "IO_ERROR", message: "path requerido" };
  }

  const root = getFileToolsRoot();
  const isAbs = path.isAbsolute(input);

  if (!root) {
    if (!isAbs) {
      return {
        ok: false,
        code: "REQUIRES_ABSOLUTE_PATH",
        message:
          "El servidor no tiene FILE_TOOLS_WORKSPACE_ROOT configurado; reintenta con un path absoluto.",
      };
    }
    return { ok: true, path: path.resolve(input) };
  }

  // Realpath del root para que sandboxes en /var (symlink a /private/var en
  // macOS) o cualquier otra cadena de symlinks funcionen: comparamos siempre
  // en "espacio real" para que el realpath del archivo cuadre con el del root.
  let realRoot: string;
  try {
    realRoot = await fsPromises.realpath(root);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    return {
      ok: false,
      code: "IO_ERROR",
      message: `FILE_TOOLS_WORKSPACE_ROOT no es accesible (${root}): ${e.message}`,
    };
  }

  const resolved = isAbs ? path.resolve(input) : path.resolve(realRoot, input);

  try {
    if (opts.kind === "read") {
      const real = await fsPromises.realpath(resolved);
      if (!isInside(real, realRoot)) {
        return {
          ok: false,
          code: "OUT_OF_SANDBOX",
          message: `el path resuelve a ${real}, fuera del sandbox (${realRoot}).`,
        };
      }
      return { ok: true, path: real };
    }
    const parent = path.dirname(resolved);
    const realParent = await fsPromises.realpath(parent);
    if (!isInside(realParent, realRoot)) {
      return {
        ok: false,
        code: "OUT_OF_SANDBOX",
        message: `el directorio padre (${realParent}) está fuera del sandbox (${realRoot}).`,
      };
    }
    return { ok: true, path: path.join(realParent, path.basename(resolved)) };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      if (opts.kind === "read") {
        return {
          ok: false,
          code: "FILE_NOT_FOUND",
          message: `archivo no encontrado: ${resolved}`,
        };
      }
      return {
        ok: false,
        code: "PARENT_DIR_NOT_FOUND",
        message: `directorio padre no existe: ${path.dirname(resolved)}`,
      };
    }
    if (e.code === "EACCES") {
      return { ok: false, code: "PERMISSION_DENIED", message: e.message };
    }
    return { ok: false, code: "IO_ERROR", message: e.message };
  }
}

function ioError(err: unknown): FileOpErr {
  const e = err as NodeJS.ErrnoException;
  if (e?.code === "EACCES") {
    return { ok: false, code: "PERMISSION_DENIED", message: e.message };
  }
  return {
    ok: false,
    code: "IO_ERROR",
    message: e instanceof Error ? e.message : String(err),
  };
}

export async function readFileSafe(
  inputPath: string,
  offset?: number,
  limit?: number,
): Promise<ReadFileOk | FileOpErr> {
  const resolved = await resolveSafePath(inputPath, { kind: "read" });
  if (!resolved.ok) return resolved;
  const filePath = resolved.path;

  let stat;
  try {
    stat = await fsPromises.stat(filePath);
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      return { ok: false, code: "FILE_NOT_FOUND", message: `archivo no encontrado: ${filePath}` };
    }
    return ioError(err);
  }
  if (stat.isDirectory()) {
    return {
      ok: false,
      code: "PATH_IS_DIRECTORY",
      message: `${filePath} es un directorio, no un archivo.`,
    };
  }
  const cap = getMaxBytes();
  if (stat.size > cap) {
    return {
      ok: false,
      code: "FILE_TOO_LARGE",
      message: `archivo de ${stat.size} bytes excede el cap de ${cap} bytes (FILE_TOOL_MAX_BYTES).`,
      details: { size: stat.size, cap },
    };
  }

  let raw: string;
  try {
    raw = await fsPromises.readFile(filePath, "utf-8");
  } catch (err) {
    return ioError(err);
  }

  const lines = raw.split("\n");
  const total = lines.length;
  const start1 = offset ?? 1;
  if (offset !== undefined && offset < 1) {
    return {
      ok: false,
      code: "INVALID_RANGE",
      message: `offset debe ser >= 1; recibido ${offset}.`,
      details: { offset, total_lines: total },
    };
  }
  if (limit !== undefined && limit < 1) {
    return {
      ok: false,
      code: "INVALID_RANGE",
      message: `limit debe ser >= 1; recibido ${limit}.`,
      details: { limit },
    };
  }
  if (start1 > total) {
    return {
      ok: false,
      code: "INVALID_RANGE",
      message: `offset ${start1} fuera de rango (archivo tiene ${total} líneas).`,
      details: { offset: start1, total_lines: total },
    };
  }

  const startIdx = start1 - 1;
  const endIdx = limit !== undefined ? Math.min(total, startIdx + limit) : total;
  const sliced = lines.slice(startIdx, endIdx);
  const formatted = sliced
    .map((line, i) => `${String(startIdx + i + 1).padStart(6)}|${line}`)
    .join("\n");

  return {
    ok: true,
    path: filePath,
    content: formatted,
    total_lines: total,
    returned_lines: sliced.length,
    offset: start1,
    truncated: endIdx < total,
  };
}

function tempName(filePath: string): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.tmp-${rand}-${Date.now()}`,
  );
}

export async function writeFileNew(
  inputPath: string,
  content: string,
): Promise<WriteFileOk | FileOpErr> {
  const cap = getMaxBytes();
  const bytes = Buffer.byteLength(content, "utf-8");
  if (bytes > cap) {
    return {
      ok: false,
      code: "FILE_TOO_LARGE",
      message: `content de ${bytes} bytes excede el cap de ${cap} bytes (FILE_TOOL_MAX_BYTES).`,
      details: { size: bytes, cap },
    };
  }

  const resolved = await resolveSafePath(inputPath, { kind: "write" });
  if (!resolved.ok) return resolved;
  const filePath = resolved.path;

  // Si el destino ya existe, fallar antes de escribir cualquier tempfile.
  try {
    await fsPromises.access(filePath);
    return {
      ok: false,
      code: "FILE_ALREADY_EXISTS",
      message: `el archivo ya existe: ${filePath}. Para modificarlo usa edit_file.`,
    };
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code !== "ENOENT") return ioError(err);
  }

  const tmp = tempName(filePath);
  try {
    await fsPromises.writeFile(tmp, content, { encoding: "utf-8", flag: "wx" });
    // Re-check antes del rename para minimizar race con otro proceso que cree
    // el archivo entre access() y rename(). Node no expone RENAME_NOREPLACE,
    // así que esto es best-effort defensivo.
    try {
      await fsPromises.access(filePath);
      await fsPromises.unlink(tmp).catch(() => undefined);
      return {
        ok: false,
        code: "FILE_ALREADY_EXISTS",
        message: `el archivo apareció durante la escritura: ${filePath}`,
      };
    } catch (err) {
      const e = err as NodeJS.ErrnoException;
      if (e.code !== "ENOENT") {
        await fsPromises.unlink(tmp).catch(() => undefined);
        return ioError(err);
      }
    }
    await fsPromises.rename(tmp, filePath);
    return { ok: true, path: filePath, bytes_written: bytes };
  } catch (err) {
    await fsPromises.unlink(tmp).catch(() => undefined);
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      return {
        ok: false,
        code: "PARENT_DIR_NOT_FOUND",
        message: `directorio padre no existe: ${path.dirname(filePath)}`,
      };
    }
    return ioError(err);
  }
}

function countOccurrences(haystack: string, needle: string): number {
  if (needle.length === 0) return 0;
  let count = 0;
  let from = 0;
  while (from <= haystack.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    count++;
    from = idx + needle.length;
  }
  return count;
}

function encodingMismatchHint(file: string, needle: string): string | undefined {
  const fileHasCRLF = file.includes("\r\n");
  const needleHasCRLF = needle.includes("\r\n");
  if (fileHasCRLF && !needleHasCRLF && needle.includes("\n")) {
    return "el archivo usa line endings CRLF (\\r\\n); reconstruye old_string reemplazando \\n por \\r\\n";
  }
  const fileHasBOM = file.charCodeAt(0) === 0xfeff;
  const needleHasBOM = needle.charCodeAt(0) === 0xfeff;
  if (fileHasBOM && !needleHasBOM) {
    return "el archivo empieza con BOM UTF-8 (\\uFEFF); si el match incluye la primera línea, prepende \\uFEFF al old_string";
  }
  return undefined;
}

function buildSnippet(
  updated: string,
  replacementStart: number,
  newStringLength: number,
): string {
  const linesBefore = updated.slice(0, replacementStart).split("\n");
  const startLineIdx = linesBefore.length - 1;
  const linesUpToEnd = updated.slice(0, replacementStart + newStringLength).split("\n");
  const endLineIdx = linesUpToEnd.length - 1;

  const allLines = updated.split("\n");
  const from = Math.max(0, startLineIdx - 2);
  const to = Math.min(allLines.length - 1, endLineIdx + 2);

  const out: string[] = [];
  for (let i = from; i <= to; i++) {
    const line = allLines[i];
    const truncated = line.length > 200 ? line.slice(0, 200) + "…" : line;
    out.push(`${String(i + 1).padStart(6)}|${truncated}`);
  }
  return out.join("\n");
}

export async function editFileExact(
  inputPath: string,
  oldString: string,
  newString: string,
): Promise<EditFileOk | FileOpErr> {
  if (oldString.length === 0) {
    return {
      ok: false,
      code: "MATCH_NOT_FOUND",
      message: "old_string no puede ser vacío.",
    };
  }

  const resolved = await resolveSafePath(inputPath, { kind: "read" });
  if (!resolved.ok) return resolved;
  const filePath = resolved.path;

  let raw: string;
  try {
    const stat = await fsPromises.stat(filePath);
    if (stat.isDirectory()) {
      return {
        ok: false,
        code: "PATH_IS_DIRECTORY",
        message: `${filePath} es un directorio, no un archivo.`,
      };
    }
    const cap = getMaxBytes();
    if (stat.size > cap) {
      return {
        ok: false,
        code: "FILE_TOO_LARGE",
        message: `archivo de ${stat.size} bytes excede el cap de ${cap} bytes.`,
        details: { size: stat.size, cap },
      };
    }
    raw = await fsPromises.readFile(filePath, "utf-8");
  } catch (err) {
    const e = err as NodeJS.ErrnoException;
    if (e.code === "ENOENT") {
      return { ok: false, code: "FILE_NOT_FOUND", message: `archivo no encontrado: ${filePath}` };
    }
    return ioError(err);
  }

  const count = countOccurrences(raw, oldString);
  if (count === 0) {
    const hint = encodingMismatchHint(raw, oldString);
    return {
      ok: false,
      code: "MATCH_NOT_FOUND",
      message: `old_string no encontrado en ${filePath}.`,
      details: hint ? { hint } : undefined,
    };
  }
  if (count > 1) {
    return {
      ok: false,
      code: "MATCH_NOT_UNIQUE",
      message: `old_string aparece ${count} veces en ${filePath}; debe ser único. Amplía old_string con líneas de contexto.`,
      details: { count },
    };
  }

  const idx = raw.indexOf(oldString);
  const updated = raw.slice(0, idx) + newString + raw.slice(idx + oldString.length);

  const cap = getMaxBytes();
  const updatedBytes = Buffer.byteLength(updated, "utf-8");
  if (updatedBytes > cap) {
    return {
      ok: false,
      code: "FILE_TOO_LARGE",
      message: `el archivo resultante (${updatedBytes} bytes) excedería el cap de ${cap} bytes.`,
      details: { size: updatedBytes, cap },
    };
  }

  const tmp = tempName(filePath);
  try {
    await fsPromises.writeFile(tmp, updated, { encoding: "utf-8", flag: "wx" });
    await fsPromises.rename(tmp, filePath);
  } catch (err) {
    await fsPromises.unlink(tmp).catch(() => undefined);
    return ioError(err);
  }

  return {
    ok: true,
    path: filePath,
    replacements: 1,
    bytes_written: updatedBytes,
    snippet: buildSnippet(updated, idx, newString.length),
  };
}
