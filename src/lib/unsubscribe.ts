import { pushToAirtable } from "@/lib/airtable/sync"
import { createAdminClient } from "@/lib/supabase/admin"

// Takes effect the moment the database write lands. Airtable is told afterwards,
// and a failure there doesn't undo anything: the next sync retries it.
export async function unsubscribeSubscriber(subscriberId: string, changedBy: string) {
  const admin = createAdminClient()

  const { data: updated, error } = await admin
    .from("subscribers")
    .update({
      unsubscribed_at: new Date().toISOString(),
      airtable_push_pending: true,
      last_changed_by: changedBy,
    })
    .eq("id", subscriberId)
    .is("unsubscribed_at", null)
    .select("id")
  if (error) throw new Error(error.message)

  if (updated.length > 0) await pushToAirtable(subscriberId)
}
