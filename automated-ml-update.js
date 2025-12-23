import fetch from 'node-fetch';
import cheerio from 'cheerio';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import cron from 'node-cron';
import btoa from 'btoa';

// --- Config ---
const HISTORY_PATH = './data/4d-history.json';
const ML_PATH = './data/4d-ml-data-latest.json';
const SOURCES = [
  'https://4dpanda.com/', 
  'https://lotto4d88.com/'
];

// GitHub config
const GITHUB = {
  OWNER: 'YOUR_USERNAME',
  REPO: 'YOUR_REPO',
  BRANCH: 'main',
  PATH: 'data/4d-ml-data-latest.json',
  TOKEN: process.env.GITHUB_TOKEN // safer to store token as env variable
};

// --- Scraper ---
async function scrape4D(url) {
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    const html = await res.text();
    const $ = cheerio.load(html);

    const results = [];
    $(".result-body").each((i, elem) => {
      const operator = $(elem).find(".result-title").text().trim();
      const date = $(elem).find(".result-date").text().trim();
      const first = $(elem).find(".first-prize").text().trim();
      const second = $(elem).find(".second-prize").text().trim();
      const third = $(elem).find(".third-prize").text().trim();

      const special = [];
      $(elem).find(".special-prize span").each((i2, sp) => special.push($(sp).text().trim()));
      const consolation = [];
      $(elem).find(".consolation-prize span").each((i3, sp) => consolation.push($(sp).text().trim()));

      results.push({ operator, date, first, second, third, special, consolation });
    });

    return results;
  } catch (err) {
    console.error("Error scraping", url, err);
    return [];
  }
}

// --- Load history ---
function loadHistory() {
  if(existsSync(HISTORY_PATH)) return JSON.parse(readFileSync(HISTORY_PATH, 'utf-8'));
  return [];
}

// --- Merge history (keep last N days) ---
function mergeHistory(existing, newResults, days=60){
  const combined = [...existing, ...newResults];
  combined.sort((a,b)=>new Date(a.date)-new Date(b.date));
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - days);
  return combined.filter(r=>new Date(r.date) >= cutoff);
}

// --- Compute ML analytics ---
function computeMLData(allResults) {
  const ml = { digitFreq:{}, posFreq:[{},{},{},{}], pairFreq:{}, prizeDist:{}, lastSeen:{}, topPicks:[] };
  allResults.forEach(d => {
    const numbers = [d.first,d.second,d.third,...d.special,...d.consolation].filter(Boolean);
    numbers.forEach(num=>{
      num.split('').forEach((digit,i)=>{ ml.digitFreq[digit]=(ml.digitFreq[digit]||0)+1; ml.posFreq[i][digit]=(ml.posFreq[i][digit]||0)+1; });
      for(let i=0;i<num.length;i++) for(let j=i+1;j<num.length;j++){ const k=num[i]+num[j]; ml.pairFreq[k]=(ml.pairFreq[k]||0)+1; }
      if(!ml.prizeDist[num]) ml.prizeDist[num]={first:0,second:0,third:0,special:0,consolation:0};
      if(num===d.first) ml.prizeDist[num].first++;
      else if(num===d.second) ml.prizeDist[num].second++;
      else if(num===d.third) ml.prizeDist[num].third++;
      else if(d.special.includes(num)) ml.prizeDist[num].special++;
      else if(d.consolation.includes(num)) ml.prizeDist[num].consolation++;
      ml.lastSeen[num] = d.date;
    });
  });

  // Generate Top 50 candidate picks
  const candidates=[];
  for(let i=0;i<10000;i++){
    const n=i.toString().padStart(4,'0');
    let score=0;
    n.split('').forEach((d,idx)=>score+=(ml.digitFreq[d]||0)+(ml.posFreq[idx][d]||0));
    for(let i=0;i<n.length;i++) for(let j=i+1;j<n.length;j++){ const k=n[i]+n[j]; score+=ml.pairFreq[k]||0; }
    if(ml.prizeDist[n]) score+=ml.prizeDist[n].first*5+ml.prizeDist[n].second*3+ml.prizeDist[n].third*2;
    candidates.push({number:n,score});
  }
  candidates.sort((a,b)=>b.score-a.score);
  ml.topPicks=candidates.slice(0,50);

  return ml;
}

// --- Push to GitHub ---
async function pushToGitHub(jsonData){
  try{
    const url = `https://api.github.com/repos/${GITHUB.OWNER}/${GITHUB.REPO}/contents/${GITHUB.PATH}`;
    const getRes = await fetch(url+`?ref=${GITHUB.BRANCH}`, { headers:{ Authorization:`token ${GITHUB.TOKEN}` } });
    const existing = await getRes.json();
    const sha = existing.sha;

    const payload = {
      message:`Auto-update 4D ML JSON ${new Date().toISOString()}`,
      content: btoa(JSON.stringify(jsonData,null,2)),
      branch: GITHUB.BRANCH,
      sha: sha
    };

    const putRes = await fetch(url,{
      method:'PUT',
      headers:{ Authorization:`token ${GITHUB.TOKEN}`, 'Content-Type':'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await putRes.json();
    console.log("✅ Pushed to GitHub:", result.content.path);
  }catch(err){ console.error("❌ Error pushing to GitHub:", err); }
}

// --- Main daily update ---
async function dailyUpdate(){
  let allResults = [];
  for(const url of SOURCES){
    const scraped = await scrape4D(url);
    allResults = allResults.concat(scraped);
  }

  let history = loadHistory();
  history = mergeHistory(history, allResults, 60); // keep last 60 days
  writeFileSync(HISTORY_PATH, JSON.stringify(history,null,2));

  const mlData = computeMLData(history);
  writeFileSync(ML_PATH, JSON.stringify(mlData,null,2));
  console.log("✅ ML JSON updated locally");

  await pushToGitHub(mlData);
}

// --- Schedule daily at 02:00 AM ---
cron.schedule('0 2 * * *', ()=>{ console.log("⏰ Running daily ML update..."); dailyUpdate(); });

// --- Run immediately on start ---
dailyUpdate();
