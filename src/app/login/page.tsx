import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GoogleSignIn } from "@/components/GoogleSignIn";
import { Logo } from "@/components/Logo";

export default async function LoginPage() {
  const session = await auth();
  if (session?.user) redirect("/dashboard");

  return (
    <main className="flex-1 grid place-items-center px-6 py-16">
      <div className="card p-8 w-full max-w-md text-center">
        <Link
          href="/"
          className="inline-flex items-center gap-2 font-display font-bold text-lg mb-6"
        >
          <Logo />
          TrackFinance
        </Link>
        <h1 className="text-2xl font-bold mb-2">Inicia sesión</h1>
        <p className="text-muted text-sm mb-8">
          Accede con tu cuenta de Google para ver tu patrimonio en tiempo real.
        </p>
        <div className="flex justify-center">
          <GoogleSignIn />
        </div>
        <p className="text-xs text-muted mt-8">
          Al continuar aceptas que se procesen tus datos únicamente para mostrar tu
          panel financiero.
        </p>
      </div>
    </main>
  );
}
