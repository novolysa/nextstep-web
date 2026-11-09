"use client";

import { CaptureComposer } from "@/components/CaptureComposer";
import { PageHeader } from "@/components/ui";
import { useI18n } from "@/lib/i18n";

export default function CapturePage() {
  const { t } = useI18n();
  return (
    <>
      <PageHeader title={t("capture.title")} />
      <p className="muted">{t("capture.intro")}</p>
      <CaptureComposer />
    </>
  );
}
