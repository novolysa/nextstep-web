"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useAuth, wasSignedOut } from "@/lib/auth/AuthProvider";
import { useI18n } from "@/lib/i18n";

export default function SignInPage() {
  const { t } = useI18n();
  const { status, signIn } = useAuth();
  const router = useRouter();
  useEffect(() => {
    document.title = `${t("auth.signInTitle")}`;
  }, [t]);
  useEffect(() => {
    if (status === "authenticated") router.replace("/");
  }, [status, router]);
  return (
    <section className="card narrow signin" aria-labelledby="signin-title">
      <h1 id="signin-title">{t("auth.signInTitle")}</h1>
      <p>{t("auth.signInBody")}</p>
      {wasSignedOut() && (
        <p className="notice" role="status">
          {t("auth.signedOut")}
        </p>
      )}
      <button type="button" className="button large" onClick={() => void signIn("/")}>
        {t("auth.signIn")}
      </button>
      <p className="muted small">{t("auth.noSecretNote")}</p>
    </section>
  );
}
