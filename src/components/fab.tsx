import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

// A page's main action as a round button floating over the bottom corner, on phones only.
// Dialogs pass it as their trigger and give it a <PlusIcon /> child.
export function Fab({ className, ...props }: React.ComponentProps<typeof Button> & { "aria-label": string }) {
  return (
    <Button
      size="icon-lg"
      className={cn(
        "fixed right-5 bottom-[calc(1.5rem+env(safe-area-inset-bottom))] z-40 size-14 rounded-full bg-foreground text-background shadow-lg hover:bg-foreground/90 md:hidden [&_svg:not([class*='size-'])]:size-6",
        className
      )}
      {...props}
    />
  )
}
