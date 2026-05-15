"use client";

import { useDeferredValue, useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { GitCommit, Plus } from "lucide-react";
import { apiFetch } from "@/lib/client-api";
import { MarkdownPreview } from "@/components/markdown-preview";
import { Button, Card, ErrorState } from "@/components/ui";

export function NotesWorkspace({ caseId }: { caseId: string }) {
  const queryClient = useQueryClient();
  const [notes, setNotes] = useState("");
  const previewNotes = useDeferredValue(notes);
  const { data, error } = useQuery({
    queryKey: ["notes", caseId],
    queryFn: () => apiFetch<{ notes: string }>(`/api/cases/${caseId}/notes`)
  });
  useEffect(() => {
    if (data?.notes) setNotes(data.notes);
  }, [data?.notes]);
  const save = useMutation({
    mutationFn: () =>
      apiFetch(`/api/cases/${caseId}/notes`, {
        method: "PATCH",
        body: JSON.stringify({ notes })
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes", caseId] })
  });
  function appendToday() {
    const today = new Date().toISOString().slice(0, 10);
    setNotes((value) => `${value.trim()}\n\n## ${today}\n\n- `);
  }

  return (
    <div className="grid gap-4 p-6 xl:grid-cols-2">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border p-3">
          <span className="font-semibold">Daily notes</span>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={appendToday}><Plus size={16} /> Today</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}><GitCommit size={16} /> Commit</Button>
          </div>
        </div>
        <textarea className="min-h-[620px] w-full resize-none border-0 p-4 font-mono text-sm outline-none" value={notes} onChange={(event) => setNotes(event.target.value)} />
        <ErrorState message={save.error instanceof Error ? save.error.message : error instanceof Error ? error.message : undefined} />
      </Card>
      <Card className="overflow-auto">
        <div className="border-b border-border p-3 font-semibold">Preview</div>
        <MarkdownPreview value={previewNotes} />
      </Card>
    </div>
  );
}
