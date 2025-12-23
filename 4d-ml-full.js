import fetch from "node-fetch";
import cheerio from "cheerio";
import fs from "fs";
import cron from "node-cron";
import readline from "readline";
import btoa from "btoa";

/* ================= CONFIG ================= */

const DAYS_TO_KEEP = 60;

const PATHS = {
  HISTORY: "./data/4d-history.json",
  ML: "./data/4d-ml-latest.json",
  CSV: "./data/4d-history.csv"
};

const SOURCES = [
  "https://4dpanda.com"
];

const GITHUB = {
  OWNER: "YOUR_GITHUB_USERNAME",
  REPO: "YOUR_REPO_NAME",
  BRANCH: "main",
  JSON_PATH: "data/4d-ml-latest.json",
  CSV_PATH: "data/4d-history.csv",
  TOKEN: process.env.GITHUB_TOKEN
};

/* ================= HELPERS ================= */

const loadJSON = p => fs.existsSync(p) ? JSON.parse(fs.readFileSync(p)) : [];
const saveJSON = (p, d) => fs.writeFileSync(p, JSON.stringify(d, null, 2));

/* ================= SCRAPER ================= */

async function scrape4D(url) {
  try {
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" }});
    const html = await res.text();
    const $ = cheerio.load(html);

    const rows = [];
    $(".result-body").each((_, el) => {
      rows.push({
        operator: $(el).find(".result-title").text().trim(),
        date: $(el).find(".result-date").text().trim(),
        first: $(el).find(".first-prize").text().trim(),
        second: $(el).find(".second-prize").text().trim(),
        third: $(el).find(".third-prize").text().trim(),
        special: $(el).find(".special-prize span").map((i,e)=>$(e).text()).get(),
        consolation: $(el).find(".consolation-prize span").map((i,e)=>$(e).text()).get()
      });
    });

    return rows;
  } catch {
    return [];
  }
}

/* ================= MERGE HISTORY ================= */

function mergeHistory(oldData, newData) {
  const map = {};
  [...oldData, ...newData].forEach(d => {
    map[d.date + d.first] = d;
  });

  const merged = Object.values(map)
    .sort((a,b)=>new Date(a.date)-new Date(b.date));

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DAYS_TO_KEEP);

  return merged.filter(d => new Date(d.date) >= cutoff);
}

/* ================= ML ENGINE ================= */

function computeML(history) {
  const ml = {
    digitFreq: {},
    posFreq: [{},{},{},{}],
    pairFreq: {},
    prizeDist: {},
    lastSeen: {},
    topPicks: []
  };

  history.forEach(d => {
    const nums = [d.first,d.second,d.third,...d.special,...d.consolation].filter(Boolean);
    nums.forEach(n => {
      n.split("").forEach((dg,i)=>{
        ml.digitFreq[dg]=(ml.digitFreq[dg]||0)+1;
        ml.posFreq[i][dg]=(ml.posFreq[i][dg]||0)+1;
      });

      for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){
        const k=n[i]+n[j];
        ml.pairFreq[k]=(ml.pairFreq[k]||0)+1;
      }

      ml.lastSeen[n]=d.date;
    });
  });

  for(let i=0;i<10000;i++){
    const n=i.toString().padStart(4,"0");
    let score=0;
    n.split("").forEach((d,i)=>{
      score+=(ml.digitFreq[d]||0)+(ml.posFreq[i][d]||0);
    });
    for(let i=0;i<4;i++)for(let j=i+1;j<4;j++){
      score+=(ml.pairFreq[n[i]+n[j]]||0);
    }
    ml.topPicks.push({number:n,score});
  }

  ml.topPicks.sort((a,b)=>b.score-a.score);
  ml.topPicks=ml.topPicks.slice(0,50);

  return ml;
}

/* ================= CSV EXPORT ================= */

function exportCSV(history){
  const rows=[["Date","Operator","1st","2nd","3rd","Special","Consolation"]];
  history.forEach(d=>{
    rows.push([
      d.date,d.operator,d.first,d.second,d.third,
      d.special.join(" "),d.consolation.join(" ")
    ]);
  });
  fs.writeFileSync(PATHS.CSV, rows.map(r=>r.join(",")).join("\n"));
}

/* ================= MANUAL MODE ================= */

function manualTest(ml){
  const rl=readline.createInterface({input:process.stdin,output:process.stdout});
  rl.question("Enter 4D numbers (comma separated): ", ans=>{
    ans.split(",").map(n=>n.trim()).forEach(n=>{
      if(!/^\d{4}$/.test(n)) return;
      let score=0;
      n.split("").forEach((d,i)=>{
        score+=(ml.digitFreq[d]||0)+(ml.posFreq[i][d]||0);
      });
      console.log(`✔ ${n} → Score ${score}`);
    });
    console.log("\nTop ML Picks:");
    ml.topPicks.slice(0,10).forEach((p,i)=>console.log(`${i+1}. ${p.number}`));
    rl.close();
  });
}

/* ================= MAIN ================= */

async function run(){
  let scraped=[];
  for(const s of SOURCES) scraped.push(...await scrape4D(s));

  const history=mergeHistory(loadJSON(PATHS.HISTORY), scraped);
  saveJSON(PATHS.HISTORY, history);

  const ml=computeML(history);
  saveJSON(PATHS.ML, ml);
  exportCSV(history);

  console.log("✅ ML Updated | Records:",history.length);
  manualTest(ml);
}

run();

/* DAILY AUTO MODE (optional) */
// cron.schedule("0 2 * * *", run);
