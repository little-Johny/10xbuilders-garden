/**
 * Smoke test para las file tools (read_file / write_file / edit_file).
 *
 * Crea un sandbox temporal en /tmp, configura FILE_TOOLS_WORKSPACE_ROOT
 * apuntando a él, y ejercita los caminos felices y los principales errores
 * (REQUIRES_ABSOLUTE_PATH, OUT_OF_SANDBOX, FILE_ALREADY_EXISTS,
 * MATCH_NOT_FOUND/UNIQUE, FILE_TOO_LARGE, hints CRLF/BOM).
 *
 * Run: npx tsx packages/agent/scripts/smoke-file-tools.ts
 *
 * Sale con código != 0 si algún assert falla. Las funciones de file-ops
 * leen process.env en cada llamada, así que el smoke solo necesita mutar las
 * env vars entre casos — sin re-imports.
 */
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { editFileExact, readFileSafe, writeFileNew } from "../src/tools/file-ops";

let failed = 0;

function expect(condition: unknown, label: string): void {
  if (condition) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

async function main(): Promise<void> {
  // Resolvemos symlinks (en macOS /var → /private/var) para comparar paths
  // siempre en "espacio real" — file-ops devuelve el realpath en sus OK.
  const sandbox = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "file-tools-smoke-")),
  );
  process.env.ALLOW_FILE_TOOLS = "true";
  process.env.FILE_TOOLS_WORKSPACE_ROOT = sandbox;
  delete process.env.FILE_TOOL_MAX_BYTES;
  console.log(`sandbox: ${sandbox}`);

  // ---------- write_file: caso feliz ----------
  console.log("\n[write_file: caso feliz]");
  {
    const target = path.join(sandbox, "hello.txt");
    const r = await writeFileNew(target, "hola mundo\n");
    expect(r.ok && r.path === target && r.bytes_written === 11, "crea archivo nuevo");
  }

  // ---------- write_file: FILE_ALREADY_EXISTS ----------
  console.log("\n[write_file: archivo ya existe]");
  {
    const target = path.join(sandbox, "hello.txt");
    const r = await writeFileNew(target, "otra cosa");
    expect(!r.ok && r.code === "FILE_ALREADY_EXISTS", "rechaza si el archivo existe");
  }

  // ---------- write_file: REQUIRES_ABSOLUTE_PATH (sin sandbox) ----------
  console.log("\n[write_file: relativo sin sandbox → REQUIRES_ABSOLUTE_PATH]");
  {
    const savedRoot = process.env.FILE_TOOLS_WORKSPACE_ROOT;
    delete process.env.FILE_TOOLS_WORKSPACE_ROOT;
    const r = await writeFileNew("relativo.txt", "x");
    expect(!r.ok && r.code === "REQUIRES_ABSOLUTE_PATH", "rechaza relativo sin root");
    process.env.FILE_TOOLS_WORKSPACE_ROOT = savedRoot;
  }

  // ---------- write_file: OUT_OF_SANDBOX ----------
  console.log("\n[write_file: ruta absoluta fuera del sandbox]");
  {
    const r = await writeFileNew("/tmp/should-fail-smoke-tools.txt", "x");
    expect(!r.ok && r.code === "OUT_OF_SANDBOX", "rechaza fuera del sandbox");
  }

  // ---------- read_file: caso feliz ----------
  console.log("\n[read_file: caso feliz]");
  {
    const target = path.join(sandbox, "hello.txt");
    const r = await readFileSafe(target);
    expect(
      r.ok && r.total_lines === 2 && r.content.includes("hola mundo"),
      "lee archivo y formatea con line numbers",
    );
  }

  // ---------- read_file: con offset/limit ----------
  console.log("\n[read_file: offset y limit]");
  {
    const target = path.join(sandbox, "multi.txt");
    await fs.writeFile(target, "a\nb\nc\nd\ne\n");
    const r = await readFileSafe(target, 2, 2);
    expect(
      r.ok && r.returned_lines === 2 && r.offset === 2 && r.truncated === true,
      "respeta offset/limit y marca truncated",
    );
  }

  // ---------- read_file: FILE_NOT_FOUND ----------
  console.log("\n[read_file: archivo inexistente]");
  {
    const r = await readFileSafe(path.join(sandbox, "no-existe.txt"));
    expect(!r.ok && r.code === "FILE_NOT_FOUND", "FILE_NOT_FOUND para archivo inexistente");
  }

  // ---------- read_file: PATH_IS_DIRECTORY ----------
  console.log("\n[read_file: path es directorio]");
  {
    const r = await readFileSafe(sandbox);
    expect(!r.ok && r.code === "PATH_IS_DIRECTORY", "PATH_IS_DIRECTORY si es dir");
  }

  // ---------- read_file: symlink fuera del sandbox ----------
  console.log("\n[read_file: symlink que apunta fuera → OUT_OF_SANDBOX]");
  {
    const link = path.join(sandbox, "evil-link.txt");
    await fs.symlink("/etc/hosts", link);
    const r = await readFileSafe(link);
    expect(!r.ok && r.code === "OUT_OF_SANDBOX", "realpath bloquea symlink hacia afuera");
  }

  // ---------- edit_file: match único ----------
  console.log("\n[edit_file: match único]");
  {
    const target = path.join(sandbox, "edit.txt");
    await fs.writeFile(target, "linea 1\nlinea 2\nlinea 3\n");
    const r = await editFileExact(target, "linea 2", "LÍNEA DOS");
    expect(
      r.ok && r.replacements === 1 && r.snippet.includes("LÍNEA DOS"),
      "reemplaza match único y devuelve snippet",
    );
    const after = await fs.readFile(target, "utf-8");
    expect(after.includes("LÍNEA DOS"), "el archivo quedó modificado en disco");
  }

  // ---------- edit_file: MATCH_NOT_FOUND ----------
  console.log("\n[edit_file: old_string no encontrado]");
  {
    const target = path.join(sandbox, "edit.txt");
    const r = await editFileExact(target, "no existe esto", "x");
    expect(!r.ok && r.code === "MATCH_NOT_FOUND", "MATCH_NOT_FOUND cuando no aparece");
  }

  // ---------- edit_file: MATCH_NOT_UNIQUE ----------
  console.log("\n[edit_file: old_string duplicado]");
  {
    const target = path.join(sandbox, "dup.txt");
    await fs.writeFile(target, "foo\nfoo\nfoo\n");
    const r = await editFileExact(target, "foo", "bar");
    expect(
      !r.ok && r.code === "MATCH_NOT_UNIQUE" && r.details?.count === 3,
      "MATCH_NOT_UNIQUE con count=3",
    );
  }

  // ---------- edit_file: hint de CRLF ----------
  console.log("\n[edit_file: archivo CRLF + old_string LF → hint]");
  {
    const target = path.join(sandbox, "crlf.txt");
    await fs.writeFile(target, "uno\r\ndos\r\ntres\r\n");
    const r = await editFileExact(target, "uno\ndos", "x");
    expect(
      !r.ok &&
        r.code === "MATCH_NOT_FOUND" &&
        typeof r.details?.hint === "string" &&
        (r.details.hint as string).includes("CRLF"),
      "MATCH_NOT_FOUND con hint sobre CRLF",
    );
  }

  // ---------- edit_file: hint de BOM ----------
  // El BOM no impide que `indexOf` encuentre substrings (el match arranca en
  // el byte 1), pero si el old_string realmente no aparece, queremos que el
  // LLM vea que el archivo empieza con BOM por si su construcción del
  // old_string asumió que el primer byte era el inicio "lógico" del contenido.
  console.log("\n[edit_file: archivo con BOM + old_string ausente → hint]");
  {
    const target = path.join(sandbox, "bom.txt");
    await fs.writeFile(target, "﻿primera linea\nsegunda linea\n");
    const r = await editFileExact(target, "no aparece esta linea", "X");
    expect(
      !r.ok &&
        r.code === "MATCH_NOT_FOUND" &&
        typeof r.details?.hint === "string" &&
        (r.details.hint as string).includes("BOM"),
      "MATCH_NOT_FOUND con hint sobre BOM",
    );
  }

  // ---------- write_file: FILE_TOO_LARGE ----------
  console.log("\n[write_file: content > cap → FILE_TOO_LARGE]");
  {
    process.env.FILE_TOOL_MAX_BYTES = "100";
    const target = path.join(sandbox, "big.txt");
    const big = "x".repeat(200);
    const r = await writeFileNew(target, big);
    expect(!r.ok && r.code === "FILE_TOO_LARGE", "rechaza content por encima del cap");
    delete process.env.FILE_TOOL_MAX_BYTES;
  }

  // ---------- cleanup ----------
  console.log("\n[cleanup]");
  await fs.rm(sandbox, { recursive: true, force: true });
  console.log("  ✓ sandbox borrado");

  if (failed > 0) {
    console.error(`\n❌ ${failed} aserciones fallaron`);
    process.exit(1);
  }
  console.log("\n✅ todos los smokes pasaron");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
