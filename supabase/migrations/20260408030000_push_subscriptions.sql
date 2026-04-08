-- Webプッシュ通知 購読管理
-- 既存の PushNotificationButton (localStorage保存) と /public/sw.js を補完
-- v2 §3.6/§5: 依存設計解禁、エンゲージメント基盤の一部
--
-- ローンチ04-12時点で購読の永続化のみ実装。
-- サーバーから通知送信する API は web-push パッケージ追加後に別途実装。

CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,                          -- 未ログイン購読も許容
  endpoint TEXT NOT NULL,                -- Web Push エンドポイントURL (一意キー)
  p256dh TEXT NOT NULL,                  -- 公開鍵
  auth TEXT NOT NULL,                    -- 認証シークレット
  user_agent TEXT,                       -- 端末識別の補助
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(endpoint)
);

CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_push_subscriptions_seen ON push_subscriptions(last_seen_at DESC);

-- RLS: 自分の購読のみ閲覧可、INSERTはサービスロール経由
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_read_own_subscriptions" ON push_subscriptions
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "users_delete_own_subscriptions" ON push_subscriptions
  FOR DELETE USING (auth.uid() = user_id);
