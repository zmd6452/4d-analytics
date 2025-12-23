const SHEET_ID="YOUR_GOOGLE_SHEET_ID";
const SHEET_TAB="1";
const JSON_URL=`https://opensheet.elk.sh/${SHEET_ID}/${SHEET_TAB}`;
const ML_JSON_URL="https://raw.githubusercontent.com/YOUR_USERNAME/YOUR_REPO/main/4d-ml-data-latest.json";

let currentData=[], mlData=null;

// Fetch sheet data
async function fetchSheetData(){
  const res=await fetch(JSON_URL);
  const data=await res.json();
  currentData=data.map(r=>({
    date:r.Date||"N/A",
    first:r.First||"",
    second:r.Second||"",
    third:r.Third||"",
    special:(r.Special||"").split(",").map(x=>x.trim()).filter(Boolean),
    consolation:(r.Consolation||"").split(",").map(x=>x.trim()).filter(Boolean)
  }));
}

// Fetch ML JSON
async function fetchMLJSON(){
  try{
    const res=await fetch(ML_JSON_URL);
    if(!res.ok) throw new Error("Not found");
    mlData=await res.json();
  }catch(e){ mlData=null; }
}

// Compute ML data + frequency + last seen + prize dist
function computeMLData(){
  const digitFreq={}, pairFreq={}, posFreq=[{},{},{},{}], lastSeen={}, prizeDist={};
  currentData.forEach(d=>{
    const allNums=[d.first,d.second,d.third,...d.special,...d.consolation].filter(Boolean);
    allNums.forEach(num=>{
      num.split('').forEach((digit,i)=>{
        digitFreq[digit]=(digitFreq[digit]||0)+1;
        posFreq[i][digit]=(posFreq[i][digit]||0)+1;
      });
      const digits=num.split('');
      for(let i=0;i<digits.length;i++)for(let j=i+1;j<digits.length;j++){
        const key=digits[i]+digits[j]; pairFreq[key]=(pairFreq[key]||0)+1;
      }
      lastSeen[num]=d.date;
      // Prize distribution
      if(!prizeDist[num]) prizeDist[num]={first:0,second:0,third:0,special:0,consolation:0};
      if(num===d.first) prizeDist[num].first++;
      else if(num===d.second) prizeDist[num].second++;
      else if(num===d.third) prizeDist[num].third++;
      else if(d.special.includes(num)) prizeDist[num].special++;
      else if(d.consolation.includes(num)) prizeDist[num].consolation++;
    });
  });
  return {digitFreq,pairFreq,posFreq,lastSeen,prizeDist};
}

// Candidate scoring
function generateCandidates(ml,must=[],exclude=[]){
  const candidates=[];
  for(let i=0;i<10000;i++){
    const n=i.toString().padStart(4,'0');
    if(!must.every(d=>n.includes(d))) continue;
    if(exclude.some(d=>n.includes(d))) continue;
    let score=0;
    const digits=n.split('');
    digits.forEach((d,i)=>{score+=(ml.digitFreq[d]||0)+(ml.posFreq[i][d]||0)});
    for(let i=0;i<digits.length;i++)for(let j=i+1;j<digits.length;j++){
      const key=digits[i]+digits[j]; score+=ml.pairFreq[key]||0;
    }
    // Add prize weight
    if(ml.prizeDist[n]) score+=ml.prizeDist[n].first*5+ml.prizeDist[n].second*3+ml.prizeDist[n].third*2;
    candidates.push({number:n,score});
  }
  candidates.sort((a,b)=>b.score-a.score);
  return candidates.slice(0,50);
}

// Render functions
function renderPicks(list){
  const ul=document.getElementById('picks'); ul.innerHTML='';
  list.forEach(item=>{const li=document.createElement('li'); li.textContent=`${item.number} (Score: ${item.score})`; ul.appendChild(li);});
}
function renderFrequency(freq){
  const tbody=document.getElementById('frequency').querySelector('tbody'); tbody.innerHTML='';
  Object.entries(freq).sort((a,b)=>b[1]-a[1]).forEach(([num,count])=>{const tr=document.createElement('tr'); tr.innerHTML=`<td>${num}</td><td>${count}</td>`; tbody.appendChild(tr);});
}
function renderLastSeen(lastSeen){
  const tbody=document.getElementById('lastSeen').querySelector('tbody'); tbody.innerHTML='';
  Object.entries(lastSeen).sort((a,b)=>new Date(b[1])-new Date(a[1])).forEach(([num,date])=>{const tr=document.createElement('tr'); tr.innerHTML=`<td>${num}</td><td>${date}</td>`; tbody.appendChild(tr);});
}
function renderPrizeDist(prizeDist){
  const tbody=document.getElementById('prizeDist').querySelector('tbody'); tbody.innerHTML='';
  Object.entries(prizeDist).forEach(([num,dist])=>{
    const tr=document.createElement('tr');
    tr.innerHTML=`<td>${num}</td><td>${dist.first}</td><td>${dist.second}</td><td>${dist.third}</td><td>${dist.special}</td><td>${dist.consolation}</td>`;
    tbody.appendChild(tr);
  });
}

// Auto-download ML JSON
function saveMLData(obj){
  const blob=new Blob([JSON.stringify(obj,null,2)],{type:'application/json'});
  const a=document.createElement('a'); a.href=URL.createObjectURL(blob);
  a.download=`4d-ml-data-${new Date().toISOString().split('T')[0]}.json`; a.click();
}

// Run analysis
async function runAnalysis(){
  const must=document.getElementById('requiredDigits').value.split(',').map(x=>x.trim());
  const exclude=document.getElementById('excludeDigits').value.split(',').map(x=>x.trim()).filter(Boolean);
  const ml=mlData||computeMLData();
  const topCandidates=generateCandidates(ml,must,exclude);
  renderPicks(topCandidates);
  renderFrequency(ml.digitFreq||{});
  renderLastSeen(ml.lastSeen||{});
  renderPrizeDist(ml.prizeDist||{});
  if(!mlData) saveMLData({...ml,topPicks:topCandidates});
}

// Auto-load
window.addEventListener('load',async()=>{
  await fetchSheetData();
  await fetchMLJSON();
  runAnalysis();
});
