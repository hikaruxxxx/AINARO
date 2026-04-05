"use client";

import { useTranslations } from "next-intl";

const STATUS_STYLES: Record<string, string> = {
  serial: "bg-green-100 text-green-800",
  complete: "bg-blue-100 text-blue-800",
  hiatus: "bg-gray-100 text-gray-600",
};

export default function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("status");
  const className = STATUS_STYLES[status] || STATUS_STYLES.serial;

  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${className}`}>
      {t.has(status) ? t(status) : status}
    </span>
  );
}
