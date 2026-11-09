"use client";

import Link from "next/link";
import { useI18n } from "@/lib/i18n";

export default function NotFound() {
  const { t } = useI18n();
  return (
    <section className="card narrow" role="alert">
      <h1>{t("errors.notFound")}</h1>
      <Link href="/" className="button">
        {t("nav.inbox")}
      </Link>
    </section>
  );
}
