import { PageHeader } from "@/components/page-header"
import { requireTeamMember } from "@/lib/auth"

import { SubscriberTable, type Subscriber } from "./subscriber-table"

export const metadata = { title: "Subscribers" }

const PAGE_SIZE = 1000

export default async function SubscribersPage() {
  const { supabase } = await requireTeamMember()

  const subscribers: Subscriber[] = []
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("subscribers")
      .select(
        "id, email, first_name, last_name, status, source, country, segments, subscribed_at, unsubscribed_at, suppressed, suppressed_reason, phone, account_owner, trip_type, departure_window, group_size, interests, interests_other, objections, objections_other"
      )
      .order("subscribed_at", { ascending: false })
      .order("id")
      .range(from, from + PAGE_SIZE - 1)
    if (error) throw new Error(error.message)
    subscribers.push(...data)
    if (data.length < PAGE_SIZE) break
  }

  const { data: statuses, error } = await supabase.from("statuses").select("value").order("position")
  if (error) throw new Error(error.message)

  const { data: segments, error: segmentsError } = await supabase.from("segments").select("id, name").order("name")
  if (segmentsError) throw new Error(segmentsError.message)

  return (
    <>
      <PageHeader title="Subscribers" description="Everyone synced from Airtable or signed up through your site." />
      <SubscriberTable
        subscribers={subscribers}
        statuses={statuses.map((status) => status.value)}
        segments={segments}
      />
    </>
  )
}
