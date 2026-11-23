import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import validator from 'gltf-validator';

const folder=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../../grafika');
const designs=JSON.parse(await fs.readFile(path.join(folder,'modele.json'),'utf8'));
let failures=0;
for(const design of designs){
  const bytes=new Uint8Array(await fs.readFile(path.join(folder,design.file)));
  const report=await validator.validateBytes(bytes,{uri:design.file,maxIssues:20});
  const issues=report.issues;
  console.log(JSON.stringify({file:design.file,bytes:bytes.byteLength,errors:issues.numErrors,warnings:issues.numWarnings,infos:issues.numInfos}));
  failures+=issues.numErrors+issues.numWarnings;
  if(issues.numErrors||issues.numWarnings)console.log(JSON.stringify(issues.messages));
}
if(failures)process.exitCode=1;
