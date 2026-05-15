"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bot, Clock, FileText, GitCommit, ListTree, NotebookText, Paperclip } from "lucide-react";
import { cn } from "@/lib/utils";

const tabs = [
  { href: "report", label: "Report", icon: FileText },
  { href: "evidence", label: "Evidence", icon: Paperclip },
  { href: "timeline", label: "Timeline", icon: ListTree },
  { href: "time", label: "Time", icon: Clock },
  { href: "notes", label: "Notes", icon: NotebookText },
  { href: "commits", label: "Commits", icon: GitCommit },
  { href: "assistant", label: "Assistant", icon: Bot }
];

export function CaseTabs({ caseId }: { caseId: string }) {
  const pathname = usePathname();
  return (
    <div className="sticky top-0 z-20 flex gap-1 overflow-x-auto border-b border-border bg-white/95 px-6 backdrop-blur">
      {tabs.map((tab) => {
        const Icon = tab.icon;
        const href = `/cases/${caseId}/${tab.href}`;
        const active = pathname === href;
        return (
          <Link
            key={tab.href}
            href={href}
            className={cn(
              "flex min-h-12 items-center gap-2 border-b-2 px-3 text-sm font-medium",
              active ? "border-primary text-primary" : "border-transparent text-slate-600 hover:text-slate-950"
            )}
          >
            <Icon size={16} />
            {tab.label}
          </Link>
        );
      })}
    </div>
  );
}
