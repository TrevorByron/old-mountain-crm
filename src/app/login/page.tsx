import { LoginForm } from "@/components/login-form"

export const metadata = { title: "Sign in" }

export default async function Page({ searchParams }: PageProps<"/login">) {
  const { error } = await searchParams

  return (
    <div className="flex min-h-svh w-full items-center justify-center p-6 md:p-10">
      <div className="w-full max-w-sm">
        <LoginForm linkError={typeof error === "string" ? error : undefined} />
      </div>
    </div>
  )
}
