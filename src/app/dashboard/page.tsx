import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { loadPortfolio } from "@/lib/portfolio";
import Dashboard from "@/components/Dashboard";
import { SignOutButton } from "@/components/SignOutButton";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login");

  const snapshot = await loadPortfolio(session.user.id);

  return (
    <Dashboard
      initial={snapshot}
      user={{
        name: session.user.name,
        email: session.user.email,
        image: session.user.image,
      }}
      signOutSlot={<SignOutButton />}
    />
  );
}
