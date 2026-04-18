import { createClient } from '@supabase/supabase-js';

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error('NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY が未設定');
    process.exit(1);
  }
  const supabase = createClient(url, serviceKey);

  const { data: users } = await supabase.auth.admin.listUsers();
  const user = users?.users.find(u => u.email === 'hm905102@gmail.com');
  if (!user) { console.log('User not found'); return; }
  console.log('User ID:', user.id);

  // episode_likes
  const { data: likes } = await supabase
    .from('episode_likes')
    .select('episode_id, created_at')
    .or(`user_id.eq.${user.id},session_id.eq.${user.id}`);
  console.log('Episode likes:', likes?.length || 0);

  // novel_follows
  const { data: follows } = await supabase
    .from('novel_follows')
    .select('novel_id, created_at')
    .or(`user_id.eq.${user.id},session_id.eq.${user.id}`);
  console.log('Novel follows:', follows?.length || 0);

  // bookmarks
  const { data: bookmarks } = await supabase
    .from('bookmarks')
    .select('novel_id, created_at')
    .eq('user_id', user.id);
  console.log('Bookmarks:', bookmarks?.length || 0);

  // episode_likesからnovel情報を引く
  if (likes?.length) {
    const episodeIds = likes.map(l => l.episode_id);
    const { data: episodes } = await supabase
      .from('episodes')
      .select('id, novel_id, episode_number, title')
      .in('id', episodeIds);
    if (episodes?.length) {
      const novelIds = [...new Set(episodes.map(e => e.novel_id))];
      const { data: novels } = await supabase
        .from('novels')
        .select('id, slug, title')
        .in('id', novelIds);
      console.log('\n=== いいねした作品 ===');
      novels?.forEach(n => console.log(`  ${n.slug} - ${n.title} (${n.id})`));
    }
  }

  // novel_followsからnovel情報を引く
  if (follows?.length) {
    const novelIds = follows.map(f => f.novel_id);
    const { data: novels } = await supabase
      .from('novels')
      .select('id, slug, title')
      .in('id', novelIds);
    console.log('\n=== フォロー中の作品 ===');
    novels?.forEach(n => console.log(`  ${n.slug} - ${n.title} (${n.id})`));
  }

  if (bookmarks?.length) {
    const novelIds = bookmarks.map(b => b.novel_id);
    const { data: novels } = await supabase
      .from('novels')
      .select('id, slug, title')
      .in('id', novelIds);
    console.log('\n=== ブックマーク作品 ===');
    novels?.forEach(n => console.log(`  ${n.slug} - ${n.title} (${n.id})`));
  }
}

main();
