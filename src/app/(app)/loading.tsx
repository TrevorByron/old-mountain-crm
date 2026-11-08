import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex flex-col gap-4">
      <Skeleton className="h-7 w-48" />
      <Skeleton className="h-4 w-80 max-w-full" />
      <Skeleton className="h-64 w-full" />
    </div>
  )
}
