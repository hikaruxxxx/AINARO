import fs from 'fs';
import * as cheerio from 'cheerio';
const UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const sleep=(ms)=>new Promise(r=>setTimeout(r,ms));

// Amazon ベストセラー（bestsellersはログインなしでhtml取得可、ただしbot対策が強い）
// ノードID: ラノベ 2293143051 / 文芸小説 2293144051 / コミック 2293145051
const targets=[
  {name:'Kindleラノベ',url:'https://www.amazon.co.jp/gp/bestsellers/digital-text/2293143051/'},
  {name:'Kindle文芸小説',url:'https://www.amazon.co.jp/gp/bestsellers/digital-text/2293144051/'},
  {name:'Kindleコミック',url:'https://www.amazon.co.jp/gp/bestsellers/digital-text/2293145051/'},
];
const out={fetchedAt:new Date().toISOString(),source:'amazon.co.jp bestsellers',categories:{}};
for(const t of targets){
  console.log('fetch',t.name);
  try{
    const r=await fetch(t.url,{headers:{'User-Agent':UA,'Accept-Language':'ja,en;q=0.7','Accept':'text/html,*/*'}});
    const html=await r.text();
    console.log('  status',r.status,'len',html.length);
    const $=cheerio.load(html);
    const items=[];
    // ベストセラー新UI: div#gridItemRoot
    $('#gridItemRoot, div.zg-grid-general-faceout').each((i,el)=>{
      const $el=$(el);
      const title=$el.find('div.p13n-sc-truncate-desktop-type2, div._cDEzb_p13n-sc-css-line-clamp-3_g3dy1, .a-link-normal span').first().text().trim();
      const rank=$el.find('span.zg-bdg-text').text().trim();
      if(title)items.push({rank,title:title.slice(0,200)});
    });
    // フォールバック
    if(items.length===0){
      $('a.a-link-normal').each((i,el)=>{
        const t=$(el).text().trim();
        if(t&&t.length>5&&t.length<200&&items.length<100)items.push({rank:'',title:t});
      });
    }
    out.categories[t.name]={url:t.url,count:items.length,items:items.slice(0,100),httpStatus:r.status,htmlLen:html.length};
  }catch(e){
    console.error('  ERR',e.message);
    out.categories[t.name]={url:t.url,error:e.message};
  }
  await sleep(2500);
}
fs.writeFileSync('/Users/hikarumori/Developer/AINARO/data/research/amazon_rankings.json',JSON.stringify(out,null,2));
for(const[k,v]of Object.entries(out.categories))console.log(k,v.count||v.error);
