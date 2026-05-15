"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FileUp, Hash, Upload } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { isAllowedEvidenceExtension, isSarifEvidence, isTextPreviewExtension } from "@/lib/evidence";
import { loadClientSettings } from "@/lib/settings";
import type { EvidenceItem } from "@/lib/types";
import { getFileExtension } from "@/lib/utils";
import { MarkdownPreview } from "@/components/markdown-preview";
import { Badge, Button, Card, ErrorState, Field, inputClass } from "@/components/ui";

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function prepareEvidenceFile(file: File) {
  const buffer = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  const sha256 = Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("");
  return { base64: arrayBufferToBase64(buffer), sha256 };
}

function decodePreview(base64?: string | null) {
  if (!base64) return "";
  try {
    return atob(base64);
  } catch {
    return "Unable to decode preview.";
  }
}

function formatTextPreview(text: string, extension: string) {
  const trimmed = text.length > 80_000 ? `${text.slice(0, 80_000)}\n\n[Preview truncated for performance.]` : text;
  if (extension !== "json" && extension !== "sarif" && extension !== "sarif.json") return trimmed;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return trimmed;
  }
}

export function EvidenceWorkspace({ caseId }: { caseId: string }) {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [uploadedBy, setUploadedBy] = useState("Nik");
  const [selected, setSelected] = useState<EvidenceItem | null>(null);
  const { data, error } = useQuery({
    queryKey: ["evidence", caseId],
    queryFn: () => apiFetch<{ evidence: EvidenceItem[] }>(`/api/cases/${caseId}/evidence`)
  });
  const { data: content } = useQuery({
    queryKey: ["evidence-content", selected?.path],
    queryFn: () => apiFetch<{ base64: string | null }>(`/api/cases/${caseId}/evidence/content?path=${encodeURIComponent(selected!.path)}`),
    enabled: Boolean(selected)
  });
  const upload = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error("Choose an evidence file first.");
      const settings = loadClientSettings();
      const extension = getFileExtension(file.name);
      if (!isAllowedEvidenceExtension(extension, settings.allowedExtensions)) {
        throw new Error(`.${extension || "unknown"} files are not allowed by local evidence settings.`);
      }
      if (file.size > settings.maxEvidenceFileSizeMb * 1024 * 1024) {
        throw new Error(`Evidence file exceeds ${settings.maxEvidenceFileSizeMb} MB.`);
      }
      const prepared = await prepareEvidenceFile(file);
      return apiFetch(`/api/cases/${caseId}/evidence`, {
        method: "POST",
        body: JSON.stringify({
          originalFilename: file.name,
          mimeType: file.type || "application/octet-stream",
          sizeBytes: file.size,
          base64: prepared.base64,
          sha256: prepared.sha256,
          uploadedBy,
          description
        })
      });
    },
    onSuccess: () => {
      setFile(null);
      setDescription("");
      queryClient.invalidateQueries({ queryKey: ["evidence", caseId] });
      queryClient.invalidateQueries({ queryKey: ["case", caseId] });
      queryClient.invalidateQueries({ queryKey: ["cases"] });
    }
  });
  const previewUrl = useMemo(() => {
    if (!selected || !content?.base64) return "";
    return `data:${selected.mimeType};base64,${content.base64}`;
  }, [content?.base64, selected]);
  const selectedExtension = selected ? getFileExtension(selected.originalFilename) : "";
  const selectedIsSarif = selected ? isSarifEvidence(selected.originalFilename) : false;
  const decodedText = useMemo(() => decodePreview(content?.base64), [content?.base64]);
  const textPreview = useMemo(() => formatTextPreview(decodedText, selectedExtension), [decodedText, selectedExtension]);

  return (
    <div className="grid gap-4 p-6 xl:grid-cols-[380px_1fr]">
      <Card className="p-4">
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold"><FileUp size={18} /> Upload evidence</h2>
        <div className="grid gap-3">
          <Field label="Evidence file">
            <input className={inputClass} type="file" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
          </Field>
          <Field label="Uploaded by">
            <input className={inputClass} value={uploadedBy} onChange={(event) => setUploadedBy(event.target.value)} />
          </Field>
          <Field label="Description">
            <textarea className={inputClass} rows={4} value={description} onChange={(event) => setDescription(event.target.value)} />
          </Field>
          {file ? (
            <div className="rounded-md bg-muted p-3 text-sm">
              {file.name} ({Math.round(file.size / 1024)} KB)
            </div>
          ) : null}
          <Button disabled={!file || upload.isPending} onClick={() => upload.mutate()}>
            <Upload size={16} /> Hash and commit
          </Button>
          <ErrorState message={upload.error instanceof Error ? upload.error.message : error instanceof Error ? error.message : undefined} />
        </div>
      </Card>
      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <Card className="overflow-hidden">
          <div className="border-b border-border p-3 font-semibold">Evidence index</div>
          <div className="grid gap-2 p-3">
            {(data?.evidence ?? []).map((item) => (
              <button key={item.id} className="grid gap-1 rounded-md border border-border p-3 text-left hover:border-primary" onClick={() => setSelected(item)}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <strong>{item.originalFilename}</strong>
                  <Badge>{isSarifEvidence(item.originalFilename) ? "sarif" : getFileExtension(item.originalFilename) || "file"}</Badge>
                </div>
                <span className="text-xs text-slate-500">{item.path}</span>
                <span className="flex items-center gap-1 text-xs text-slate-600"><Hash size={13} /> {item.sha256.slice(0, 24)}...</span>
              </button>
            ))}
          </div>
        </Card>
        <Card className="overflow-hidden">
          <div className="border-b border-border p-3 font-semibold">Preview</div>
          {selected ? (
            <div className="grid gap-3 p-4 text-sm">
              <div className="font-semibold">{selected.originalFilename}</div>
              <div className="break-all rounded-md bg-muted p-3">{selected.sha256}</div>
              {selected.mimeType.startsWith("image/") && previewUrl ? <img src={previewUrl} alt={selected.originalFilename} className="max-h-[420px] rounded-md border border-border object-contain" /> : null}
              {selected.mimeType.includes("pdf") && previewUrl ? <iframe src={previewUrl} className="h-[420px] w-full rounded-md border border-border" title={selected.originalFilename} /> : null}
              {isTextPreviewExtension(selectedExtension) && content?.base64 ? (
                selectedExtension === "md" ? (
                  <MarkdownPreview value={textPreview} />
                ) : (
                  <pre className="max-h-[420px] overflow-auto rounded-md bg-slate-950 p-3 text-xs text-white">{textPreview}</pre>
                )
              ) : null}
              {selectedIsSarif ? <div className="rounded-md border border-primary/25 bg-primary/5 p-3 text-sm text-slate-700">CodeQL SARIF evidence detected. Findings are preserved as raw SARIF JSON for report review and AI context.</div> : null}
              {["zip", "tar.gz"].includes(selectedExtension) ? <div className="rounded-md bg-muted p-3">Archive metadata only. Extraction is intentionally not performed.</div> : null}
            </div>
          ) : (
            <div className="p-4 text-sm text-slate-500">Select evidence to inspect metadata and preview supported content.</div>
          )}
        </Card>
      </div>
    </div>
  );
}
