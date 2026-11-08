"use client"

import { useActionState } from "react"
import { cn } from "cn"

import { sendMagicLink, type LoginState } from "@/app/login/actions"
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"

const initialState: LoginState = { status: "idle" }

const LINK_ERRORS: Record<string, string> = {
  link_expired:
    "That sign-in link didn't work. It may have expired or been used already. Request a new one and open it in this browser.",
  not_invited: "That account hasn't been invited to this workspace. Ask a teammate for an invite.",
}

export function LoginForm({
  className,
  linkError,
  ...props
}: React.ComponentProps<"div"> & { linkError?: string }) {
  const [state, formAction, pending] = useActionState(sendMagicLink, initialState)
  const invalid = state.status === "invalid"
  const linkErrorMessage = linkError ? LINK_ERRORS[linkError] : undefined

  return (
    <div className={cn("flex flex-col gap-6", className)} {...props}>
      <Card>
        <CardHeader>
          <CardTitle>Sign in to Old Mountain CRM</CardTitle>
          <CardDescription>
            We&apos;ll email a sign-in link to your invited address.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {linkErrorMessage && state.status === "idle" && (
            <Alert variant="destructive">
              <AlertDescription>{linkErrorMessage}</AlertDescription>
            </Alert>
          )}
          {state.status === "error" && (
            <Alert variant="destructive">
              <AlertDescription>We couldn&apos;t send the link. Try again in a minute.</AlertDescription>
            </Alert>
          )}
          {state.status === "rate_limited" && (
            <Alert variant="destructive">
              <AlertDescription>
                Too many sign-in emails have gone out. Try again in about an hour, or use the most
                recent link in your inbox.
              </AlertDescription>
            </Alert>
          )}
          {state.status === "sent" ? (
            <Alert>
              <AlertTitle>Check your email</AlertTitle>
              <AlertDescription>
                If that address has been invited, a sign-in link is on its way.
              </AlertDescription>
            </Alert>
          ) : (
            <form action={formAction}>
              <FieldGroup>
                <Field data-invalid={invalid || undefined}>
                  <FieldLabel htmlFor="email">Email</FieldLabel>
                  <Input
                    id="email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    placeholder="name@old-mountain.com"
                    aria-invalid={invalid || undefined}
                    required
                  />
                  {invalid && <FieldDescription>Enter a valid email address.</FieldDescription>}
                </Field>
                <Field>
                  <Button type="submit" disabled={pending}>
                    {pending && <Spinner data-icon="inline-start" />}
                    Email me a sign-in link
                  </Button>
                </Field>
              </FieldGroup>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
