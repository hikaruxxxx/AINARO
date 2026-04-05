const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  serial: { label: "連載中", className: "bg-green-100 text-green-800" },
  complete: { label: "完結", className: "bg-blue-100 text-blue-800" },
  hiatus: { label: "休止", className: "bg-gray-100 text-gray-600" },
};

export default function StatusBadge({ status }: { status: string }) {
  const config = STATUS_CONFIG[status] || STATUS_CONFIG.serial;
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}
