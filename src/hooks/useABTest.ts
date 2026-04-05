"use client";

import { useState, useEffect } from "react";
import { getSessionId } from "@/lib/tracking";

type ABTestState = {
  variantId: string | null;
  bodyMd: string | null;
  bodyHtml: string | null;
  loading: boolean;
};

// A/Bテストのバリアント取得フック
// エピソードIDに対してrunning中のテストがあれば、割り当てられたバリアントの本文を返す
export function useABTest(episodeId: string) {
  const [state, setState] = useState<ABTestState>({
    variantId: null,
    bodyMd: null,
    bodyHtml: null,
    loading: true,
  });

  useEffect(() => {
    const sessionId = getSessionId();
    if (!sessionId) {
      setState((prev) => ({ ...prev, loading: false }));
      return;
    }

    fetch("/api/ab-test/assign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ episode_id: episodeId, session_id: sessionId }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.variant) {
          setState({
            variantId: data.variant.variant_id,
            bodyMd: data.variant.body_md,
            bodyHtml: data.variant.body_html,
            loading: false,
          });
        } else {
          setState({ variantId: null, bodyMd: null, bodyHtml: null, loading: false });
        }
      })
      .catch(() => {
        setState({ variantId: null, bodyMd: null, bodyHtml: null, loading: false });
      });
  }, [episodeId]);

  return state;
}
