export const CASE_STATUSES = [
  "Opened",
  "Evidence Collection",
  "Analysis",
  "Report Drafting",
  "Peer Review",
  "Closed",
  "Archived"
] as const;

export const SEVERITIES = ["Informational", "Low", "Medium", "High", "Critical"] as const;

export const DEFAULT_ALLOWED_EXTENSIONS = [
  "png",
  "jpg",
  "jpeg",
  "webp",
  "pdf",
  "md",
  "txt",
  "csv",
  "json",
  "sarif",
  "zip",
  "tar.gz",
  "log",
  "js",
  "ts",
  "sh",
  "py",
  "yml",
  "yaml"
];

export const DEFAULT_TEMPLATE_HEADINGS = [
  "Case Summary",
  "Case Information",
  "Scope",
  "Background",
  "Timeline",
  "Evidence Collected",
  "Technical Analysis",
  "Findings",
  "Impact",
  "Recommendations",
  "Conclusion",
  "Appendix"
];

export const AI_CONTEXT_SCOPES = [
  "Report only",
  "Report + metadata",
  "Report + metadata + evidence filenames",
  "Report + metadata + evidence filenames + readable evidence content"
] as const;

export const AI_COMMANDS = [
  "/summarize-report",
  "/find-missing-sections",
  "/improve-case-summary",
  "/rewrite-selected-section",
  "/add-evidence-checklist",
  "/improve-findings",
  "/improve-recommendations",
  "/generate-timeline-summary",
  "/check-report-consistency",
  "/create-final-report-polish"
] as const;
