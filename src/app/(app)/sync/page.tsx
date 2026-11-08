import { PageHeader } from "@/components/page-header"
import { requireTeamMember } from "@/lib/auth"

import { SyncPanel, type SyncRun } from "./sync-panel"

export const metadata = { title: "Airtable sync" }

export default async function SyncPage() {
  const { supabase } = await requireTeamMember()

  const { data, error } = await supabase
    .from("sync_runs")
    .select("id, trigger, started_at, finished_at, created_count, updated_count, error")
    .order("started_at", { ascending: false })
    .limit(10)
  if (error) throw new Error(error.message)

  const runs: SyncRun[] = data

  return (
    <>
      <PageHeader
        title="Airtable sync"
        description="Airtable owns contact details. Syncs run every 15 minutes once the first import is committed."
      />
      <SyncPanel runs={runs} />
    </>
  )
}
