import { DEFAULT_TEMPLATE_HEADINGS } from "./constants";
import { getEvidenceExtension, isSarifEvidence } from "./evidence";

export function cn(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function slugify(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);
}

export function formatDuration(totalSeconds: number) {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, "0")).join(":");
}

export function makeReportTemplate(headings = DEFAULT_TEMPLATE_HEADINGS) {
  return headings
    .map((heading, index) => `${index === 0 ? "#" : "##"} ${heading}`)
    .join("\n\n")
    .concat("\n");
}

export function safeJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

export function getFileExtension(filename: string) {
  return getEvidenceExtension(filename);
}

export function classifyEvidence(filename: string, mimeType = "") {
  const ext = getFileExtension(filename);
  if (["png", "jpg", "jpeg", "webp"].includes(ext)) return "screenshots";
  if (["log", "txt", "csv", "json", "sarif", "sarif.json", "md"].includes(ext) || isSarifEvidence(filename)) return "logs";
  if (["zip", "tar.gz"].includes(ext)) return "archives";
  if (["pdf"].includes(ext) || mimeType.includes("pdf")) return "documents";
  if (["js", "ts", "sh", "py", "yml", "yaml"].includes(ext)) return "scripts";
  return "documents";
}

export function sanitizeFilename(filename: string) {
  const cleaned = filename.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return cleaned || "evidence.bin";
}

export function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function applyReportPatch(report: string, patch: { operation: string; oldText?: string; newText: string }) {
  if (patch.operation === "replace" && patch.oldText && report.includes(patch.oldText)) {
    return report.replace(patch.oldText, patch.newText);
  }
  if (patch.operation === "prepend") {
    return `${patch.newText.trim()}\n\n${report}`;
  }
  return `${report.trim()}\n\n${patch.newText.trim()}\n`;
}

export function buildLineDiff(oldText = "", newText = "") {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");
  return [
    ...oldLines.map((line) => ({ type: "removed" as const, line })),
    ...newLines.map((line) => ({ type: "added" as const, line }))
  ];
}
