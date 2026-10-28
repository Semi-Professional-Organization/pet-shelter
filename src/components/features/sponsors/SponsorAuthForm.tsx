"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, LogIn, UserPlus, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { registerSponsorAction, sponsorLoginAction } from "@/actions/sponsors";

type Mode = "login" | "register";

/**
 * Sponsor sign-in and account claim.
 *
 * Registration asks for a receipt number on purpose: contributions are keyed by donor
 * email, so the receipt is what proves the person registering is the person who gave.
 * Without it, anyone could claim another donor's history and standing.
 */
export function SponsorAuthForm({ initialMode = "login" }: { initialMode?: Mode }) {
  const { isMs } = useLanguage();
  const router = useRouter();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [receiptNumber, setReceiptNumber] = useState("");
  const [displayOnWall, setDisplayOnWall] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const isRegister = mode === "register";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = isRegister
        ? await registerSponsorAction({
            name,
            email,
            password,
            receiptNumber,
            displayOnWall,
          })
        : await sponsorLoginAction({ email, password });

      if (!result.success) {
        setError(result.error ?? "Something went wrong. Please try again.");
        return;
      }

      router.replace("/sponsor/dashboard");
      router.refresh();
    } catch {
      setError(
        isMs
          ? "Tidak dapat menghubungi pelayan. Sila cuba lagi."
          : "Could not reach the server. Please try again."
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-6 rounded-3xl border border-border bg-card p-6 sm:p-8">
      <div className="space-y-2">
        <h1 className="font-heading text-2xl font-bold text-foreground">
          {isRegister
            ? isMs
              ? "Tuntut portal penaja anda"
              : "Claim your sponsor portal"
            : isMs
              ? "Log masuk penaja"
              : "Sponsor sign in"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {isRegister
            ? isMs
              ? "Sudah menaja haiwan rescue? Gunakan nombor resit daripada e-Resit penajaan itu untuk menuntut sejarah penajaan anda."
              : "Sponsored a rescue? Use the receipt number from that sponsorship's e-Receipt to claim your sponsorship history."
            : isMs
              ? "Akses rescue anda, taraf penajaan dan kandungan eksklusif."
              : "Access your rescues, sponsorship standing and exclusive content."}
        </p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {isRegister ? (
          <div className="space-y-1.5">
            <Label htmlFor="sponsorName" className="text-xs font-semibold">
              {isMs ? "Nama penuh *" : "Full name *"}
            </Label>
            <Input
              id="sponsorName"
              required
              autoComplete="name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="e.g. Jason Lim"
              className="rounded-lg"
            />
          </div>
        ) : null}

        <div className="space-y-1.5">
          <Label htmlFor="sponsorEmail" className="text-xs font-semibold">
            {isMs ? "Alamat e-mel *" : "Email address *"}
          </Label>
          <Input
            id="sponsorEmail"
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="jason.lim@example.com"
            className="rounded-lg"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sponsorPassword" className="text-xs font-semibold">
            {isMs ? "Kata laluan *" : "Password *"}
          </Label>
          <Input
            id="sponsorPassword"
            type="password"
            required
            minLength={isRegister ? 10 : undefined}
            autoComplete={isRegister ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="rounded-lg"
          />
          {isRegister ? (
            <p className="text-xs text-muted-foreground">
              {isMs ? "Sekurang-kurangnya 10 aksara." : "At least 10 characters."}
            </p>
          ) : null}
        </div>

        {isRegister ? (
          <>
            <div className="space-y-1.5">
              <Label htmlFor="sponsorReceipt" className="text-xs font-semibold">
                {isMs ? "Nombor resit derma *" : "Donation receipt number *"}
              </Label>
              <Input
                id="sponsorReceipt"
                required
                value={receiptNumber}
                onChange={(event) => setReceiptNumber(event.target.value.toUpperCase())}
                placeholder="HFS-DON-202608-482145"
                className="rounded-lg font-mono"
              />
              <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                <Info className="mt-0.5 size-3 shrink-0" aria-hidden />
                {isMs
                  ? "Terdapat di bahagian atas e-Resit yang kami hantar selepas anda menderma."
                  : "Found at the top of the e-Receipt we emailed you after your donation."}
              </p>
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-lg border border-border p-3">
              <input
                type="checkbox"
                checked={displayOnWall}
                onChange={(event) => setDisplayOnWall(event.target.checked)}
                className="mt-0.5 size-4 shrink-0 cursor-pointer accent-primary"
              />
              <span className="text-xs leading-snug text-foreground">
                {isMs
                  ? "Paparkan nama saya di Dinding Penaja awam Hope for Strays."
                  : "Display my name on the Hope for Strays Public Sponsor Wall."}
              </span>
            </label>
          </>
        ) : null}

        {error ? (
          <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
            {error}
          </p>
        ) : null}

        <Button type="submit" disabled={isSubmitting} className="w-full gap-2 font-bold">
          {isSubmitting ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : isRegister ? (
            <UserPlus className="size-4" aria-hidden />
          ) : (
            <LogIn className="size-4" aria-hidden />
          )}
          {isRegister
            ? isMs
              ? "Tuntut akaun saya"
              : "Claim my account"
            : isMs
              ? "Log masuk"
              : "Sign in"}
        </Button>
      </form>

      <p className="border-t border-border pt-4 text-center text-sm text-muted-foreground">
        {isRegister
          ? isMs
            ? "Sudah mempunyai akaun?"
            : "Already have an account?"
          : // A sponsorship receipt, not any donation: registration only accepts a receipt
            // that matches a pet sponsorship, so a general gift's receipt is always refused.
            isMs
            ? "Menaja haiwan rescue tetapi belum mempunyai akaun?"
            : "Sponsored a rescue but have no account yet?"}{" "}
        <button
          type="button"
          onClick={() => {
            setMode(isRegister ? "login" : "register");
            setError(null);
          }}
          className="font-semibold text-primary-ink underline underline-offset-4 cursor-pointer"
        >
          {isRegister
            ? isMs
              ? "Log masuk"
              : "Sign in"
            : isMs
              ? "Tuntut portal anda"
              : "Claim your portal"}
        </button>
      </p>
    </div>
  );
}
