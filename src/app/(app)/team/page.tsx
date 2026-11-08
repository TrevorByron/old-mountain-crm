import { PageHeader } from "@/components/page-header"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { requireTeamMember } from "@/lib/auth"

import { InviteDialog } from "./invite-dialog"

export const metadata = { title: "Team" }

const dateFormat = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" })

export default async function TeamPage() {
  const { supabase } = await requireTeamMember()

  const { data: members, error } = await supabase
    .from("team_members")
    .select("id, email, name, invited_at, last_login_at")
    .order("invited_at")
  if (error) throw new Error(error.message)

  return (
    <>
      <PageHeader title="Team" description="Everyone here is a full admin. Only invited emails can sign in.">
        <InviteDialog />
      </PageHeader>
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="hidden md:table-cell">Invited</TableHead>
                <TableHead className="hidden md:table-cell">Last sign-in</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {members.map((member) => (
                <TableRow key={member.id}>
                  <TableCell>{member.name ?? "-"}</TableCell>
                  <TableCell>{member.email}</TableCell>
                  <TableCell className="hidden md:table-cell">{dateFormat.format(new Date(member.invited_at))}</TableCell>
                  <TableCell className="hidden md:table-cell">
                    {member.last_login_at ? dateFormat.format(new Date(member.last_login_at)) : "Not yet"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  )
}
