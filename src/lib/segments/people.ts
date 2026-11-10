export type EmailStatusInput = {
  email: string | null
  marketing_ok: boolean
  unsubscribed_at: string | null
  suppressed: boolean
  suppressed_reason?: string | null
}

export type EmailStatus = "active" | "bounced" | "complained" | "suppressed" | "unsubscribed" | "no_email" | "not_opted_in"

export const EMAIL_STATUS_LABELS: Record<EmailStatus, string> = {
  active: "Active",
  bounced: "Bounced",
  complained: "Marked as spam",
  suppressed: "Stopped",
  unsubscribed: "Unsubscribed",
  no_email: "No email",
  not_opted_in: "Not opted in",
}

// Whether this person gets marketing email, and if not, the main reason why.
export function emailStatus(person: EmailStatusInput): EmailStatus {
  if (person.suppressed) {
    if (person.suppressed_reason === "hard_bounce") return "bounced"
    if (person.suppressed_reason === "complaint") return "complained"
    return "suppressed"
  }
  if (person.unsubscribed_at) return "unsubscribed"
  if (!person.email) return "no_email"
  if (!person.marketing_ok) return "not_opted_in"
  return "active"
}

export const canBeEmailed = (person: EmailStatusInput) => emailStatus(person) === "active"
