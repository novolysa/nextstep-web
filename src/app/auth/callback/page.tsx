"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/lib/auth/AuthProvider";
import { useI18n } from "@/lib/i18n";
import { LoadingState } from "@/components/ui";

export default function CallbackPage() {
  const { t } = useI18n();
  const { completeSignIn, signIn } = useAuth();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    completeSignIn()
      // Client-side replace keeps the in-memory session and drops the code from history.
      .then((returnTo) => router.replace(returnTo))
      .catch(() => setFailed(true));
  }, [completeSignIn, router]);
  if (!failed) return <LoadingState label={t("auth.completing")} />;
  return (
    <section className="card narrow" role="alert">
      <h1>{t("auth.signInTitle")}</h1>
      <p>{t("auth.callbackFailed")}</p>
      <button type="button" className="button" onClick={() => void signIn("/")}>
        {t("auth.signIn")}
      </button>
    </section>
  );
}
