import { PageHeader } from "@/components/page-header"
import { requireTeamMember } from "@/lib/auth"

import { AddPersonDialog } from "./add-person-dialog"
import { SubscriberTable, type Subscriber } from "./subscriber-table"

export const metadata = { title: "People" }

const PAGE_SIZE = 1000

export default async function SubscribersPage() {
  const { supabase } = await requireTeamMember()

  const rows: Omit<Subscriber, "lifecycle" | "last_touch">[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("subscribers")
      .select(
        "id, email, first_name, last_name, status, source, country, segments, subscribed_at, unsubscribed_at, suppressed, suppressed_reason, phone, account_owner, trip_type, departure_window, group_size, interests, interests_other, objections, objections_other, tags, about, marketing_ok"
      )
      .order("subscribed_at", { ascending: false })
      .order("id")
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    rows.push(...data)
    if (data.length < PAGE_SIZE) break
  }

  const lifecycles = new Map<string, string>()
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("contact_lifecycle")
      .select("subscriber_id, lifecycle")
      .order("subscriber_id")
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    data.forEach((row) => lifecycles.set(row.subscriber_id, row.lifecycle))
    if (data.length < PAGE_SIZE) break
  }

  const lastTouches = new Map<string, string>()
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("contact_last_touch")
      .select("subscriber_id, last_touch")
      .order("subscriber_id")
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    data.forEach((row) => lastTouches.set(row.subscriber_id, row.last_touch))
    if (data.length < PAGE_SIZE) break
  }

  const subscribers: Subscriber[] = rows.map((row) => ({
    ...row,
    lifecycle: lifecycles.get(row.id) ?? "subscriber",
    last_touch: lastTouches.get(row.id) ?? null,
  }))

  const { data: statuses, error } = await supabase.from("statuses").select("value").order("position")
  if (error) throw new Error(error.message)

  const { data: segments, error: segmentsError } = await supabase.from("segments").select("id, name").order("name")
  if (segmentsError) throw new Error(segmentsError.message)

  return (
    <>
      <PageHeader title="People" description="Everyone you know: on your list, in conversation, or back from a safari.">
        <AddPersonDialog />
      </PageHeader>
      <SubscriberTable
        subscribers={subscribers}
        statuses={statuses.map((status) => status.value)}
        segments={segments}
      />
    </>
  )
}
