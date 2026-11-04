import fs from 'node:fs';import path from 'node:path';import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
const repo=path.resolve(new URL('..',import.meta.url).pathname);
export function externalKeyPath(keyFile,output){
  if(!keyFile)throw new Error('EXTERNAL_KEY_FILE_REQUIRED');const p=path.resolve(keyFile),realParent=fs.realpathSync(path.dirname(p)),real=path.join(realParent,path.basename(p));
  for(const base of [repo,path.resolve(output)])if(real===base||real.startsWith(base+path.sep))throw new Error('KEY_MUST_BE_OUTSIDE_REPOSITORY_AND_REVIEW');
  if(fs.existsSync(p)&&fs.lstatSync(p).isSymbolicLink())throw new Error('KEY_SYMLINK_NOT_ALLOWED');return real;
}
export function sealKey(record,keyFile,output){const p=externalKeyPath(keyFile,output),key=randomBytes(32),iv=randomBytes(12);fs.writeFileSync(p,key,{mode:0o600,flag:'wx'});const cipher=createCipheriv('aes-256-gcm',key,iv),bytes=Buffer.concat([cipher.update(JSON.stringify(record),'utf8'),cipher.final()]);return {schema:'MIZAN-REVIEW-VAULT/1',algorithm:'AES-256-GCM',iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:bytes.toString('base64')};}
export function openKey(vault,keyFile,output){const key=fs.readFileSync(externalKeyPath(keyFile,output));if(key.length!==32||vault.schema!=='MIZAN-REVIEW-VAULT/1')throw new Error('INVALID_REVIEW_KEY');const dec=createDecipheriv('aes-256-gcm',key,Buffer.from(vault.iv,'base64'));dec.setAuthTag(Buffer.from(vault.tag,'base64'));return JSON.parse(Buffer.concat([dec.update(Buffer.from(vault.ciphertext,'base64')),dec.final()]).toString('utf8'));}
