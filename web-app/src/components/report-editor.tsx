"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitCommit, List, RotateCcw, Save } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { DEFAULT_TEMPLATE_HEADINGS } from "@/lib/constants";
import { applyReportPatch } from "@/lib/utils";
import { useAppStore } from "@/lib/store";
import { MarkdownPreview } from "@/components/markdown-preview";
import { Badge, Button, Card, ErrorState } from "@/components/ui";

export function ReportEditor({ caseId }: { caseId: string }) {
  const queryClient = useQueryClient();
  const activePatch = useAppStore((state) => state.activePatch);
  const setActivePatch = useAppStore((state) => state.setActivePatch);
  const draftKey = `forensicpad.report.${caseId}`;
  const { data, error, isLoading } = useQuery({
    queryKey: ["report", caseId],
    queryFn: () => apiFetch<{ report: string }>(`/api/cases/${caseId}/report`)
  });
  const [report, setReport] = useState("");
  const [draftRestored, setDraftRestored] = useState(false);
  const committedReport = data?.report ?? "";
  const previewReport = useDeferredValue(report);

  useEffect(() => {
    if (data?.report && !draftRestored) {
      const draft = localStorage.getItem(draftKey);
      setReport(draft ?? data.report);
      setDraftRestored(true);
    }
  }, [data?.report, draftKey, draftRestored]);

  useEffect(() => {
    if (!draftRestored) return;
    const timer = window.setTimeout(() => localStorage.setItem(draftKey, report), 350);
    return () => window.clearTimeout(timer);
  }, [draftKey, draftRestored, report]);

  const headings = useMemo(
    () =>
      report
        .split("\n")
        .map((line, index) => ({ line, index }))
        .filter((item) => item.line.startsWith("#")),
    [report]
  );
  const dirty = report !== committedReport;

  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/api/cases/${caseId}/report`, {
        method: "PATCH",
        body: JSON.stringify({ report })
      }),
    onSuccess: () => {
      localStorage.removeItem(draftKey);
      queryClient.invalidateQueries({ queryKey: ["report", caseId] });
      queryClient.invalidateQueries({ queryKey: ["case", caseId] });
      queryClient.invalidateQueries({ queryKey: ["cases"] });
    }
  });

  function approvePatch() {
    if (!activePatch) return;
    setReport((current) => applyReportPatch(current, activePatch.patch));
    setActivePatch(null);
  }

  return (
    <div className="grid gap-4 p-6">
      <ErrorState message={error instanceof Error ? error.message : undefined} />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={dirty ? "amber" : "green"}>{dirty ? "Local draft" : "Clean"}</Badge>
          {isLoading ? <span className="text-sm text-slate-500">Loading report</span> : null}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setReport(committedReport)} disabled={!dirty}>
            <RotateCcw size={16} /> Restore committed
          </Button>
          <Button variant="secondary" onClick={() => setReport((value) => `${value.trim()}\n\n## ${DEFAULT_TEMPLATE_HEADINGS[0]}\n`)}>
            <List size={16} /> Insert section
          </Button>
          <Button onClick={() => save.mutate()} disabled={!dirty || save.isPending}>
            <GitCommit size={16} /> Commit report
          </Button>
        </div>
      </div>
      <ErrorState message={save.error instanceof Error ? save.error.message : undefined} />
      {activePatch ? (
        <Card className="grid gap-3 border-primary p-4">
          <div className="font-semibold">Pending AI edit: {activePatch.summary}</div>
          <div className="text-sm text-slate-600">{activePatch.target.heading ?? "report.md"} requires approval before it touches the draft.</div>
          <div className="flex gap-2">
            <Button onClick={approvePatch}>
              <Save size={16} /> Approve into draft
            </Button>
            <Button variant="secondary" onClick={() => setActivePatch(null)}>Reject</Button>
          </div>
        </Card>
      ) : null}
      <div className="grid min-h-[640px] gap-4 xl:grid-cols-[220px_minmax(0,1fr)_minmax(0,1fr)]">
        <Card className="overflow-hidden bg-white/95">
          <div className="border-b border-border p-3 text-sm font-semibold">Headings</div>
          <div className="grid max-h-[600px] gap-1 overflow-auto p-2">
            {headings.map((item) => (
              <button key={`${item.index}-${item.line}`} className="rounded px-2 py-1 text-left text-sm hover:bg-muted" onClick={() => navigator.clipboard?.writeText(String(item.index + 1))}>
                {item.line.replace(/^#+\s*/, "")}
              </button>
            ))}
          </div>
        </Card>
        <Card className="overflow-hidden bg-white/95">
          <div className="border-b border-border p-3 text-sm font-semibold">Markdown editor</div>
          <textarea
            value={report}
            onChange={(event) => setReport(event.target.value)}
            spellCheck={false}
            className="h-[600px] w-full resize-none border-0 bg-white p-4 font-mono text-sm leading-6 outline-none"
          />
        </Card>
        <Card className="overflow-auto bg-white/95">
          <div className="border-b border-border p-3 text-sm font-semibold">Preview</div>
          <MarkdownPreview value={previewReport} />
        </Card>
      </div>
    </div>
  );
}
