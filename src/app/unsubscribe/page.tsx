import { Button } from "@/components/ui/button"
import { Card, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { requireEnv } from "@/lib/env"
import { verifyUnsubscribeToken } from "@/lib/unsubscribe-token"

import { confirmUnsubscribe } from "./actions"

export const metadata = { title: "Unsubscribe" }

export default async function UnsubscribePage({ searchParams }: PageProps<"/unsubscribe">) {
  const { token, done } = await searchParams
  const tokenValue = typeof token === "string" ? token : ""
  const valid = verifyUnsubscribeToken(tokenValue, requireEnv("UNSUBSCRIBE_TOKEN_SECRET")) !== null
  const brand = process.env.BRAND_NAME || "this mailing list"

  return (
    <main className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <Card className="w-full max-w-sm">
        {done ? (
          <CardHeader>
            <CardTitle>You&apos;re unsubscribed</CardTitle>
            <CardDescription>You won&apos;t receive any more marketing email from {brand}.</CardDescription>
          </CardHeader>
        ) : valid ? (
          <>
            <CardHeader>
              <CardTitle>Unsubscribe from {brand}?</CardTitle>
              <CardDescription>This stops all marketing email to your address, starting right away.</CardDescription>
            </CardHeader>
            <CardFooter>
              <form action={confirmUnsubscribe} className="w-full">
                <input type="hidden" name="token" value={tokenValue} />
                <Button type="submit" className="w-full">
                  Unsubscribe
                </Button>
              </form>
            </CardFooter>
          </>
        ) : (
          <CardHeader>
            <CardTitle>This link isn&apos;t valid</CardTitle>
            <CardDescription>
              It may have been cut off. Open the unsubscribe link from the email again, or reply to the email and ask
              to be removed.
            </CardDescription>
          </CardHeader>
        )}
      </Card>
    </main>
  )
}
