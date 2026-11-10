import { AudienceHeader, AudienceTabs } from "@/components/audience-header"
import { PeopleTable } from "@/components/people-table"
import { requireTeamMember } from "@/lib/auth"
import { loadPeople } from "@/lib/people/load"

import { AddPersonDialog } from "./add-person-dialog"

export const metadata = { title: "Audience" }

// Customers have booked or traveled with you, going by the furthest stage any of their trip plans reached.
const CUSTOMER_LIFECYCLES = ["customer", "past_guest"]

export default async function SubscribersPage({ searchParams }: PageProps<"/subscribers">) {
  const { show } = await searchParams
  const customersOnly = show === "customers"
  const { supabase } = await requireTeamMember()

  const { people: everyone } = await loadPeople(supabase)
  const people = customersOnly ? everyone.filter((person) => CUSTOMER_LIFECYCLES.includes(person.lifecycle)) : everyone

  return (
    <>
      <AudienceHeader
        active={customersOnly ? "customers" : "subscribers"}
        description={customersOnly ? "People who've booked or traveled with you." : "Everyone you know: on your list, in conversation, or back from a safari."}
        tabs={false}
      />
      <PeopleTable
        key={customersOnly ? "customers" : "everyone"}
        people={people}
        lifecycles={customersOnly ? CUSTOMER_LIFECYCLES : undefined}
        title={<AudienceTabs active={customersOnly ? "customers" : "subscribers"} />}
        actions={<AddPersonDialog />}
      />
    </>
  )
}
