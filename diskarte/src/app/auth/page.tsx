import { redirect } from "next/navigation";

/** `/auth` is a friendly alias for the sign-in page (sign-out lands here). */
export default async function AuthIndex({ searchParams }: PageProps<"/auth">) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) if (typeof value === "string") params.set(key, value);
  const query = params.toString();
  redirect(query ? `/login?${query}` : "/login");
}
