import "server-only";

import { Octokit } from "@octokit/rest";
import crypto from "node:crypto";
import {
  CASE_STATUSES,
  DEFAULT_ALLOWED_EXTENSIONS,
  DEFAULT_TEMPLATE_HEADINGS,
  SEVERITIES
} from "./constants";
import type { CaseListItem, CaseMetadata, CommitItem, EvidenceItem, TimelineEvent, TimeSession } from "./types";
import { isAllowedEvidenceExtension } from "./evidence";
import { OPENROUTER_DEFAULT_MODEL } from "./settings";
import { classifyEvidence, getFileExtension, makeId, makeReportTemplate, sanitizeFilename, slugify } from "./utils";

type CommitFile = {
  path: string;
  content: string;
  encoding?: "utf-8" | "base64";
};

const LIST_CASES_CACHE_MS = 20_000;
let casesCache: { key: string; expiresAt: number; data: CaseListItem[] } | null = null;

export type ServerSettings = {
  owner: string;
  repo: string;
  branch: string;
  root: string;
  model: string;
};

export class ConfigurationError extends Error {}

export function getServerSettings(): ServerSettings {
  const owner = process.env.GITHUB_OWNER ?? "";
  const repo = process.env.GITHUB_REPO ?? "";
  const branch = process.env.GITHUB_BRANCH ?? "main";
  const root = normalizeRoot(process.env.INVESTIGATIONS_ROOT ?? "investigations");
  const model = process.env.OPENROUTER_DEFAULT_MODEL ?? OPENROUTER_DEFAULT_MODEL;
  return { owner, repo, branch, root, model };
}

export function normalizeRoot(value: string) {
  return value.replace(/^\/+|\/+$/g, "") || "investigations";
}

function getOctokit() {
  if (!process.env.GITHUB_TOKEN) {
    throw new ConfigurationError("GITHUB_TOKEN is not configured. Add it to .env.local to enable GitHub sync.");
  }
  return new Octokit({ auth: process.env.GITHUB_TOKEN });
}

function requireRepo() {
  const settings = getServerSettings();
  if (!settings.owner || !settings.repo) {
    throw new ConfigurationError("GITHUB_OWNER and GITHUB_REPO must be configured in .env.local.");
  }
  return settings;
}

export function assertManagedPath(path: string) {
  const { root } = getServerSettings();
  const normalized = path.replace(/^\/+/, "");
  if (!normalized.startsWith(`${root}/`) && normalized !== root) {
    throw new Error(`Refusing to modify unmanaged path: ${path}`);
  }
  if (normalized.includes("..")) {
    throw new Error(`Refusing unsafe path traversal: ${path}`);
  }
  return normalized;
}

async function getContent(path: string) {
  const settings = requireRepo();
  const octokit = getOctokit();
  try {
    const response = await octokit.repos.getContent({
      owner: settings.owner,
      repo: settings.repo,
      path,
      ref: settings.branch
    });
    return response.data;
  } catch (error: unknown) {
    if (typeof error === "object" && error && "status" in error && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function readTextFile(path: string) {
  assertManagedPath(path);
  const content = await getContent(path);
  if (!content || Array.isArray(content) || content.type !== "file" || !("content" in content)) return null;
  return Buffer.from(content.content, "base64").toString("utf8");
}

export async function readBase64File(path: string) {
  assertManagedPath(path);
  const content = await getContent(path);
  if (!content || Array.isArray(content) || content.type !== "file" || !("content" in content)) return null;
  return content.content.replace(/\n/g, "");
}

export async function readJsonFile<T>(path: string, fallback: T): Promise<T> {
  const text = await readTextFile(path);
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}

export async function commitFiles(message: string, files: CommitFile[]) {
  const settings = requireRepo();
  const octokit = getOctokit();
  const safeFiles = files.map((file) => ({ ...file, path: assertManagedPath(file.path) }));

  const ref = await octokit.git.getRef({
    owner: settings.owner,
    repo: settings.repo,
    ref: `heads/${settings.branch}`
  });
  const latestCommit = await octokit.git.getCommit({
    owner: settings.owner,
    repo: settings.repo,
    commit_sha: ref.data.object.sha
  });

  const tree = await Promise.all(
    safeFiles.map(async (file) => {
      const blob = await octokit.git.createBlob({
        owner: settings.owner,
        repo: settings.repo,
        content: file.content,
        encoding: file.encoding === "base64" ? "base64" : "utf-8"
      });
      return {
        path: file.path,
        mode: "100644" as const,
        type: "blob" as const,
        sha: blob.data.sha
      };
    })
  );

  const newTree = await octokit.git.createTree({
    owner: settings.owner,
    repo: settings.repo,
    base_tree: latestCommit.data.tree.sha,
    tree
  });
  const commit = await octokit.git.createCommit({
    owner: settings.owner,
    repo: settings.repo,
    message,
    tree: newTree.data.sha,
    parents: [latestCommit.data.sha]
  });
  await octokit.git.updateRef({
    owner: settings.owner,
    repo: settings.repo,
    ref: `heads/${settings.branch}`,
    sha: commit.data.sha
  });
  casesCache = null;
  return commit.data;
}

export async function listCases(): Promise<CaseListItem[]> {
  const settings = requireRepo();
  const cacheKey = `${settings.owner}/${settings.repo}/${settings.branch}/${settings.root}`;
  if (casesCache?.key === cacheKey && casesCache.expiresAt > Date.now()) {
    return casesCache.data;
  }
  const content = await getContent(settings.root);
  if (!content || !Array.isArray(content)) return [];

  const dirs = content.filter((item) => item.type === "dir");
  const cases = await Promise.all(
    dirs.map(async (dir) => {
      const folderName = dir.name;
      const basePath = `${settings.root}/${folderName}`;
      const metadata = await readJsonFile<CaseMetadata | null>(`${basePath}/metadata.json`, null);
      if (!metadata) return null;
      const sessions = await readJsonFile<TimeSession[]>(`${basePath}/time-sessions.json`, []);
      const evidence = await readJsonFile<EvidenceItem[]>(`${basePath}/evidence/index.json`, []);
      const totalSeconds = sessions.reduce((sum, session) => sum + session.durationSeconds, 0);
      return {
        ...metadata,
        folderName,
        path: basePath,
        totalSeconds,
        evidenceCount: evidence.length
      };
    })
  );

  const data = cases.filter(Boolean).sort((a, b) => b!.updatedAt.localeCompare(a!.updatedAt)) as CaseListItem[];
  casesCache = { key: cacheKey, expiresAt: Date.now() + LIST_CASES_CACHE_MS, data };
  return data;
}

export async function findCaseFolder(caseIdOrFolder: string) {
  const decoded = decodeURIComponent(caseIdOrFolder);
  const cases = await listCases();
  const match = cases.find((item) => item.folderName === decoded || item.caseId === decoded);
  if (!match) throw new Error(`Case not found: ${decoded}`);
  return match.folderName;
}

export async function readCaseBundle(caseIdOrFolder: string) {
  const settings = getServerSettings();
  const folderName = await findCaseFolder(caseIdOrFolder);
  const basePath = `${settings.root}/${folderName}`;
  const [metadata, report, timeline, sessions, notes, evidence] = await Promise.all([
    readJsonFile<CaseMetadata>(`${basePath}/metadata.json`, {} as CaseMetadata),
    readTextFile(`${basePath}/report.md`),
    readJsonFile<TimelineEvent[]>(`${basePath}/timeline.json`, []),
    readJsonFile<TimeSession[]>(`${basePath}/time-sessions.json`, []),
    readTextFile(`${basePath}/daily-notes.md`),
    readJsonFile<EvidenceItem[]>(`${basePath}/evidence/index.json`, [])
  ]);
  return { folderName, basePath, metadata, report: report ?? "", timeline, sessions, notes: notes ?? "", evidence };
}

export async function createCase(input: {
  title: string;
  severity?: string;
  investigator?: string;
  tags?: string[];
  templateHeadings?: string[];
}) {
  const settings = getServerSettings();
  const cases = await listCases();
  const nextNumber =
    Math.max(0, ...cases.map((item) => Number(item.caseId.match(/\d+/)?.[0] ?? 0))) + 1;
  const caseId = `CASE-${String(nextNumber).padStart(3, "0")}`;
  const folderName = `${caseId}-${slugify(input.title) || "untitled-case"}`;
  const basePath = `${settings.root}/${folderName}`;
  const now = new Date().toISOString();
  const severity = SEVERITIES.includes(input.severity as never) ? input.severity : "Medium";
  const metadata: CaseMetadata = {
    caseId,
    title: input.title.trim(),
    status: CASE_STATUSES[0],
    severity: severity as CaseMetadata["severity"],
    createdAt: now,
    updatedAt: now,
    investigator: input.investigator?.trim() || "Nik",
    relatedRepository: "",
    relatedCommitSha: "",
    relatedWorkflowRun: "",
    relatedArtifact: "",
    tags: input.tags ?? [],
    summary: ""
  };
  const timeline: TimelineEvent[] = [
    {
      id: makeId("evt"),
      timestamp: now,
      type: "case_created",
      title: "Case created",
      description: "Initial investigation case was created.",
      source: "ForensicPad"
    }
  ];
  const dailyNotes = `# Daily Notes\n\n## ${now.slice(0, 10)}\n\n- Initial case opened.\n`;
  await commitFiles(`Create case ${caseId} ${slugify(input.title)}`, [
    { path: `${basePath}/report.md`, content: makeReportTemplate(input.templateHeadings ?? DEFAULT_TEMPLATE_HEADINGS) },
    { path: `${basePath}/metadata.json`, content: JSON.stringify(metadata, null, 2) },
    { path: `${basePath}/timeline.json`, content: JSON.stringify(timeline, null, 2) },
    { path: `${basePath}/time-sessions.json`, content: "[]" },
    { path: `${basePath}/daily-notes.md`, content: dailyNotes },
    { path: `${basePath}/evidence/index.json`, content: "[]" }
  ]);
  return { ...metadata, folderName, path: basePath, totalSeconds: 0, evidenceCount: 0 };
}

export async function updateMetadata(caseIdOrFolder: string, patch: Partial<CaseMetadata>) {
  const bundle = await readCaseBundle(caseIdOrFolder);
  const metadata: CaseMetadata = {
    ...bundle.metadata,
    ...patch,
    caseId: bundle.metadata.caseId,
    createdAt: bundle.metadata.createdAt,
    updatedAt: new Date().toISOString()
  };
  await commitFiles(`Update metadata for ${metadata.caseId}`, [
    { path: `${bundle.basePath}/metadata.json`, content: JSON.stringify(metadata, null, 2) }
  ]);
  return metadata;
}

export async function appendTimeline(caseIdOrFolder: string, event: Omit<TimelineEvent, "id">) {
  const bundle = await readCaseBundle(caseIdOrFolder);
  const timeline = [
    ...bundle.timeline,
    {
      ...event,
      id: makeId("evt")
    }
  ].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  await commitFiles(`Add timeline event for ${bundle.metadata.caseId}`, [
    { path: `${bundle.basePath}/timeline.json`, content: JSON.stringify(timeline, null, 2) }
  ]);
  return timeline;
}

export async function updateReport(caseIdOrFolder: string, report: string, message?: string) {
  const bundle = await readCaseBundle(caseIdOrFolder);
  const now = new Date().toISOString();
  const timeline = [
    ...bundle.timeline,
    {
      id: makeId("evt"),
      timestamp: now,
      type: "report_updated",
      title: "Report updated",
      description: "report.md was committed to GitHub.",
      source: "ForensicPad"
    }
  ];
  const metadata = { ...bundle.metadata, updatedAt: now };
  await commitFiles(message ?? `Update report for ${metadata.caseId}`, [
    { path: `${bundle.basePath}/report.md`, content: report },
    { path: `${bundle.basePath}/timeline.json`, content: JSON.stringify(timeline, null, 2) },
    { path: `${bundle.basePath}/metadata.json`, content: JSON.stringify(metadata, null, 2) }
  ]);
  return { report, timeline, metadata };
}

export async function uploadEvidence(
  caseIdOrFolder: string,
  input: {
    originalFilename: string;
    mimeType: string;
    sizeBytes: number;
    base64: string;
    sha256: string;
    uploadedBy: string;
    description: string;
  }
) {
  const ext = getFileExtension(input.originalFilename);
  if (!isAllowedEvidenceExtension(ext, DEFAULT_ALLOWED_EXTENSIONS)) {
    throw new Error(`.${ext || "unknown"} files are not allowed.`);
  }
  const maxBytes = Number(process.env.MAX_EVIDENCE_FILE_SIZE_MB ?? 15) * 1024 * 1024;
  if (input.sizeBytes > maxBytes) throw new Error(`Evidence file exceeds ${Math.round(maxBytes / 1024 / 1024)} MB.`);

  const buffer = Buffer.from(input.base64, "base64");
  const serverHash = crypto.createHash("sha256").update(buffer).digest("hex");
  if (serverHash !== input.sha256) throw new Error("Evidence SHA-256 hash mismatch.");

  const bundle = await readCaseBundle(caseIdOrFolder);
  const now = new Date().toISOString();
  const storedFilename = `${now.slice(0, 10)}-${sanitizeFilename(input.originalFilename)}`;
  const category = classifyEvidence(input.originalFilename, input.mimeType);
  const path = `${bundle.basePath}/evidence/${category}/${storedFilename}`;
  const item: EvidenceItem = {
    id: makeId("ev"),
    originalFilename: input.originalFilename,
    storedFilename,
    path,
    sizeBytes: input.sizeBytes,
    mimeType: input.mimeType,
    sha256: input.sha256,
    uploadedAt: now,
    uploadedBy: input.uploadedBy || bundle.metadata.investigator,
    description: input.description
  };
  const evidence = [...bundle.evidence, item];
  const timeline = [
    ...bundle.timeline,
    {
      id: makeId("evt"),
      timestamp: now,
      type: "evidence_uploaded",
      title: "Evidence uploaded",
      description: `${input.originalFilename} was added to evidence.`,
      source: "ForensicPad"
    }
  ];
  await commitFiles(`Upload evidence for ${bundle.metadata.caseId}`, [
    { path, content: input.base64, encoding: "base64" },
    { path: `${bundle.basePath}/evidence/index.json`, content: JSON.stringify(evidence, null, 2) },
    { path: `${bundle.basePath}/timeline.json`, content: JSON.stringify(timeline, null, 2) },
    {
      path: `${bundle.basePath}/metadata.json`,
      content: JSON.stringify({ ...bundle.metadata, updatedAt: now }, null, 2)
    }
  ]);
  return item;
}

export async function saveTimeSession(caseIdOrFolder: string, session: Omit<TimeSession, "id">) {
  const bundle = await readCaseBundle(caseIdOrFolder);
  const now = new Date().toISOString();
  const sessions = [...bundle.sessions, { ...session, id: makeId("session") }];
  const timeline = [
    ...bundle.timeline,
    {
      id: makeId("evt"),
      timestamp: now,
      type: "time_session",
      title: "Time session logged",
      description: `${Math.round(session.durationSeconds / 60)} minutes added to the investigation.`,
      source: "ForensicPad"
    }
  ];
  await commitFiles(`Add time session for ${bundle.metadata.caseId}`, [
    { path: `${bundle.basePath}/time-sessions.json`, content: JSON.stringify(sessions, null, 2) },
    { path: `${bundle.basePath}/timeline.json`, content: JSON.stringify(timeline, null, 2) }
  ]);
  return sessions;
}

export async function saveNotes(caseIdOrFolder: string, notes: string) {
  const bundle = await readCaseBundle(caseIdOrFolder);
  const now = new Date().toISOString();
  await commitFiles(`Update daily notes for ${bundle.metadata.caseId}`, [
    { path: `${bundle.basePath}/daily-notes.md`, content: notes },
    {
      path: `${bundle.basePath}/metadata.json`,
      content: JSON.stringify({ ...bundle.metadata, updatedAt: now }, null, 2)
    }
  ]);
  return notes;
}

export async function listCommits(caseIdOrFolder: string): Promise<CommitItem[]> {
  const settings = requireRepo();
  const octokit = getOctokit();
  const folderName = await findCaseFolder(caseIdOrFolder);
  const path = `${settings.root}/${folderName}`;
  const response = await octokit.repos.listCommits({
    owner: settings.owner,
    repo: settings.repo,
    sha: settings.branch,
    path,
    per_page: 30
  });
  return response.data.map((commit) => ({
    sha: commit.sha,
    message: commit.commit.message,
    author: commit.commit.author?.name ?? "Unknown",
    date: commit.commit.author?.date ?? "",
    url: commit.html_url
  }));
}

export function apiError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected server error";
  const status = error instanceof ConfigurationError ? 503 : 400;
  return Response.json({ error: message }, { status });
}
