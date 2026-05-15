export function PageHeader({
  title,
  eyebrow,
  children
}: {
  title: string;
  eyebrow?: string;
  children?: React.ReactNode;
}) {
  return (
    <header className="border-b border-border bg-white/95 px-6 py-5 backdrop-blur">
      {eyebrow ? <div className="mb-1 text-xs font-semibold uppercase tracking-widest text-primary">{eyebrow}</div> : null}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-bold tracking-normal">{title}</h1>
        {children}
      </div>
    </header>
  );
}
