"use client";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="ja">
      <body>
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          minHeight: "100vh",
          fontFamily: "system-ui, sans-serif",
          padding: "2rem",
          textAlign: "center",
        }}>
          <h2 style={{ marginBottom: "0.5rem", fontSize: "1.25rem" }}>問題が発生しました</h2>
          <p style={{ marginBottom: "0.5rem", color: "#888", fontSize: "0.875rem" }}>
            ページの読み込みに失敗しました。再試行してください。
          </p>
          {error.message && <p style={{ marginBottom: "0.5rem", color: "#e55", fontSize: "0.75rem", fontFamily: "monospace" }}>{error.message}</p>}
          {error.digest && <p style={{ marginBottom: "1.5rem", color: "#aaa", fontSize: "0.75rem", fontFamily: "monospace" }}>digest: {error.digest}</p>}
          <button
            onClick={reset}
            style={{
              padding: "0.625rem 1.5rem",
              borderRadius: "9999px",
              backgroundColor: "#111",
              color: "#fff",
              border: "none",
              fontSize: "0.875rem",
              cursor: "pointer",
            }}
          >
            再試行
          </button>
        </div>
      </body>
    </html>
  );
}
