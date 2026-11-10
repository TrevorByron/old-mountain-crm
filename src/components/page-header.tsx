export function PageHeader({
  title,
  description,
  fab,
  children,
}: {
  title: React.ReactNode
  description?: string
  // The page's main action as a floating + button on phones. The buttons in `children` then show
  // on larger screens only.
  fab?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    // Flodesk's big, light title. The hint under it only shows on larger screens.
    <div className="flex items-center justify-between gap-3">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="font-heading text-[1.875rem] leading-tight font-normal tracking-tight">{title}</h1>
        {description && <p className="text-sm text-muted-foreground max-md:hidden">{description}</p>}
      </div>
      {children && <div className={`flex shrink-0 items-center gap-2 ${fab ? "max-md:hidden" : ""}`}>{children}</div>}
      {fab}
    </div>
  )
}
