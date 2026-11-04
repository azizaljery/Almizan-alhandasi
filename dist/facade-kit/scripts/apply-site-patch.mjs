import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
if(!process.argv[2])throw new Error('Usage: node scripts/apply-site-patch.mjs /absolute/repository');
const repo=path.resolve(process.argv[2]),patch=JSON.parse(fs.readFileSync(new URL('../integration/site-patch.json',import.meta.url))),target=path.join(repo,patch.target);
const sha=bytes=>createHash('sha256').update(bytes).digest('hex'),replacement=fs.readFileSync(new URL('../'+patch.replacement,import.meta.url));
if(sha(fs.readFileSync(target))===sha(replacement)){console.log('Site patch already applied.');process.exit(0);}
if(sha(fs.readFileSync(target))!==patch.expectedFileSha256)throw new Error('SITE_SOURCE_CHANGED: review the PR diff; do not overwrite newer design.mjs.');
fs.writeFileSync(target,replacement);console.log('Applied optional preview integration to '+patch.target);
