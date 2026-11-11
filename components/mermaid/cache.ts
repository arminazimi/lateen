import { randomUUID } from "node:crypto";
import { mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

/**
 * Bumped when caching or rendering changes what a render produces, so an older entry is never reused.
 * It is part of the diagram key and of the cache path, so a change invalidates every older entry.
 */
export const MERMAID_CACHE_FORMAT = 1;

/** Set to a directory to keep rendered diagrams between build processes. Unset (or empty) disables it. */
export const CACHE_DIR_ENV = "LATEEN_MERMAID_CACHE_DIR";

/** The largest entry read back; a real diagram is far smaller. Anything bigger is a miss, not page output. */
export const MAX_ENTRY_BYTES = 4 * 1024 * 1024;

/** The configured cache directory, resolved against the working directory, or `null` when disabled. */
export function diagramCacheDir(): string | null {
  const value = process.env[CACHE_DIR_ENV]?.trim() ?? "";
  return value === "" ? null : value;
}

/** Where one key's entry lives. The format is a directory, so older entries are never even read. */
export function diagramCachePath(dir: string, key: string): string {
  return join(dir, `v${String(MERMAID_CACHE_FORMAT)}`, `${key}.json`);
}

interface CacheEntry {
  readonly format: number;
  readonly key: string;
  readonly svg: string;
}

/** The SVG stored for a key, or `null` for a miss, an older format, a partial write, or a corrupt entry. */
export function readDiagramCache(dir: string, key: string): string | null {
  const path = diagramCachePath(dir, key);
  try {
    if (statSync(path).size > MAX_ENTRY_BYTES) return null;
    const parsed: unknown = JSON.parse(readFileSync(path, "utf8"));
    if (typeof parsed !== "object" || parsed === null) return null;
    const entry = parsed as Partial<CacheEntry>;
    if (entry.format !== MERMAID_CACHE_FORMAT || entry.key !== key) return null;
    return typeof entry.svg === "string" && entry.svg !== "" ? entry.svg : null;
  } catch {
    return null;
  }
}

/** Stores an SVG for a key with a same-directory temp file and a rename, so readers see all or nothing. */
export function writeDiagramCache(dir: string, key: string, svg: string): void {
  const path = diagramCachePath(dir, key);
  const temp = `${path}.${String(process.pid)}.${randomUUID()}.tmp`;
  try {
    mkdirSync(dirname(path), { recursive: true });
    const entry: CacheEntry = { format: MERMAID_CACHE_FORMAT, key, svg };
    writeFileSync(temp, JSON.stringify(entry), "utf8");
    renameSync(temp, path);
  } catch {
    // A read-only or failing cache is only a lost saving: the render already succeeded.
    try {
      rmSync(temp, { force: true });
    } catch {
      // Nothing else to do: the entry was never the page's source of truth.
    }
  }
}
