"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function WriterActions({
  userId,
  currentStatus,
}: {
  userId: string;
  currentStatus: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const handleToggle = async () => {
    const newStatus = currentStatus === "approved" ? "suspended" : "approved";
    const confirm = window.confirm(
      newStatus === "suspended"
        ? "この作家を停止しますか？新規投稿ができなくなります。"
        : "この作家の停止を解除しますか？"
    );
    if (!confirm) return;

    setLoading(true);
    try {
      const res = await fetch(`/api/admin/writers/${userId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ writer_status: newStatus }),
      });
      if (res.ok) {
        router.refresh();
      }
    } catch { /* エラーは静かに処理 */ }
    finally { setLoading(false); }
  };

  if (currentStatus === "approved") {
    return (
      <button
        onClick={handleToggle}
        disabled={loading}
        className="rounded-md px-2.5 py-1 text-xs font-medium text-red-600 transition-colors hover:bg-red-50 disabled:opacity-50"
      >
        停止
      </button>
    );
  }

  if (currentStatus === "suspended") {
    return (
      <button
        onClick={handleToggle}
        disabled={loading}
        className="rounded-md px-2.5 py-1 text-xs font-medium text-green-600 transition-colors hover:bg-green-50 disabled:opacity-50"
      >
        再開
      </button>
    );
  }

  return null;
}
