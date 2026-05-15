import { DEFAULT_ALLOWED_EXTENSIONS } from "./constants";

export const TEXT_PREVIEW_EXTENSIONS = [
  "txt",
  "log",
  "json",
  "sarif",
  "sarif.json",
  "csv",
  "md",
  "js",
  "ts",
  "sh",
  "py",
  "yml",
  "yaml"
];

export function getEvidenceExtension(filename: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".tar.gz")) return "tar.gz";
  if (lower.endsWith(".sarif.json")) return "sarif.json";
  const part = lower.split(".").pop();
  return part ?? "";
}

export function isAllowedEvidenceExtension(extension: string, allowedExtensions = DEFAULT_ALLOWED_EXTENSIONS) {
  if (allowedExtensions.includes(extension)) return true;
  return extension === "sarif.json" && allowedExtensions.includes("sarif");
}

export function isSarifEvidence(filename: string) {
  const extension = getEvidenceExtension(filename);
  return extension === "sarif" || extension === "sarif.json";
}

export function isTextPreviewExtension(extension: string) {
  return TEXT_PREVIEW_EXTENSIONS.includes(extension);
}
