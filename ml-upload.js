import fetch from 'node-fetch';
import fs from 'fs';

const GITHUB_TOKEN="YOUR_GITHUB_TOKEN";
const REPO_OWNER="YOUR_USERNAME";
const REPO_NAME="YOUR_REPO";
const FILE_PATH="data/4d-ml-data-latest.json";

const mlData=JSON.parse(fs.readFileSync("./data/4d-ml-data-latest.json","utf8"));
const contentBase64=Buffer.from(JSON.stringify(mlData,null,2)).toString('base64');

async function getFileSha(){
  const res=await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`,{
    headers:{Authorization:`token ${GITHUB_TOKEN}`,Accept:'application/vnd.github.v3+json'}
  });
  if(res.status===404) return null;
  const data=await res.json();
  return data.sha;
}

async function uploadToGitHub(){
  const sha=await getFileSha();
  const message=sha?"Update ML JSON":"Create ML JSON";
  const res=await fetch(`https://api.github.com/repos/${REPO_OWNER}/${REPO_NAME}/contents/${FILE_PATH}`,{
    method:'PUT',
    headers:{Authorization:`token ${GITHUB_TOKEN}`,Accept:'application/vnd.github.v3+json'},
    body:JSON.stringify({message,content:contentBase64,sha})
  });
  if(!res.ok){ console.error(await res.text()); return; }
  const data=await res.json();
  console.log("ML JSON uploaded:",data.content.html_url);
}

uploadToGitHub();
