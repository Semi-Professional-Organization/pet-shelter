"use client";

import { useState } from "react";
import { MessageCircleHeart, Send, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useLanguage } from "@/components/providers/LanguageProvider";
import { submitCaretakerQuestionAction } from "@/actions/sponsors";

/**
 * Gold perk: direct Q&A with the sanctuary caretakers.
 *
 * Rendered inside a `<TierGate requiredTier="GOLD">`, but that gate is presentation only.
 * `submitCaretakerQuestionAction` re-verifies the standing server-side on every call.
 */
export function CaretakerQaBox() {
  const { isMs } = useLanguage();
  const [message, setMessage] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      const result = await submitCaretakerQuestionAction(message);
      if (!result.success) {
        setError(result.error ?? "Could not send your message.");
        return;
      }
      setSent(true);
      setMessage("");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 rounded-2xl border border-border bg-card p-6">
      <div className="space-y-1">
        <h3 className="inline-flex items-center gap-2 font-heading text-lg font-bold text-foreground">
          <MessageCircleHeart className="size-4.5 text-primary-ink" aria-hidden />
          {isMs ? "Soal jawab dengan penjaga" : "Caretaker Q&A"}
        </h3>
        <p className="text-sm text-muted-foreground">
          {isMs
            ? "Tanya penjaga kami secara terus tentang rescue yang anda tajai. Kami membalas dalam masa tiga hari bekerja."
            : "Ask our caretakers directly about the rescues you sponsor. We reply within three working days."}
        </p>
      </div>

      {sent ? (
        <p
          role="status"
          className="inline-flex items-center gap-2 rounded-lg bg-primary/10 p-3 text-sm font-semibold text-primary-ink"
        >
          <CheckCircle2 className="size-4" aria-hidden />
          {isMs
            ? "Mesej anda telah dihantar kepada pasukan penjagaan."
            : "Your message has been sent to the care team."}
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="caretakerMessage" className="text-xs font-semibold">
              {isMs ? "Mesej anda" : "Your message"}
            </Label>
            <Textarea
              id="caretakerMessage"
              rows={4}
              required
              minLength={10}
              maxLength={2000}
              value={message}
              onChange={(event) => setMessage(event.target.value)}
              placeholder={
                isMs
                  ? "Bagaimana perkembangan pemulihan Luna minggu ini?"
                  : "How is Luna's recovery progressing this week?"
              }
              className="rounded-lg"
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}

          <Button type="submit" disabled={isSubmitting} size="sm" className="gap-2 font-bold">
            {isSubmitting ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <Send className="size-4" aria-hidden />
            )}
            {isMs ? "Hantar kepada penjaga" : "Send to caretakers"}
          </Button>
        </form>
      )}
    </div>
  );
}
