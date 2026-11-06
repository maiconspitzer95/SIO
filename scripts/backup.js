import { mkdir, mkdtemp, readFile, writeFile, copyFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { readConfig } from '../server/config/env.js';
import { createPool } from '../server/config/database.js';

export const digest=async path=>createHash('sha256').update(await readFile(path)).digest('hex');
export function pgCommand(config,name,args){
 const url=new URL(config.DATABASE_URL),bin=process.env.PG_BIN||(process.platform==='win32'?'C:\\Program Files\\PostgreSQL\\17\\bin':'/usr/bin');
 const result=spawnSync(join(bin,name+(process.platform==='win32'?'.exe':'')),args,{encoding:'utf8',windowsHide:true,timeout:300000,env:{...process.env,PGHOST:url.hostname,PGPORT:url.port||'5432',PGDATABASE:decodeURIComponent(url.pathname.slice(1)),PGUSER:decodeURIComponent(url.username),PGPASSWORD:decodeURIComponent(url.password),PGSSLMODE:config.ssl?'verify-full':'prefer',...(config.PG_CA_FILE?{PGSSLROOTCERT:config.PG_CA_FILE}:{})}});
 if(result.status!==0)throw new Error(`${name} falhou (código ${result.status??'indisponível'}). Verifique permissões e conexão.`);
}
/** Anexos são imutáveis: a cópia após o dump inclui todos os arquivos referidos pelo snapshot. */
export async function backup(config,destination){
 await mkdir(destination,{recursive:true});const directory=await mkdtemp(join(resolve(destination),'sio-'+new Date().toISOString().replace(/[:.]/g,'-')+'-'));
 pgCommand(config,'pg_dump',['--format=custom','--no-owner','--file',join(directory,'database.dump')]);
 pgCommand(config,'pg_restore',['--list',join(directory,'database.dump')]);
 const pool=createPool(config);const attachments=[];
 try{
  const exists=(await pool.query("SELECT to_regclass('public.anexos') AS tabela")).rows[0].tabela;
  if(exists){
   const source=resolve(config.STORAGE_PATH||fileURLToPath(new URL('../storage/private/',import.meta.url)));
   await mkdir(join(directory,'storage'));
   for(const a of (await pool.query('SELECT armazenamento,sha256 FROM anexos')).rows){
    if(!/^[a-f0-9-]+\.(pdf|png|jpg)$/.test(a.armazenamento))throw new Error('Referência de anexo inválida.');
    const target=join(directory,'storage',a.armazenamento);await copyFile(join(source,a.armazenamento),target);
    if(await digest(target)!==a.sha256)throw new Error('Integridade de anexo inválida.');attachments.push(a);
   }
  }
 }finally{await pool.end();}
 await writeFile(join(directory,'manifest.json'),JSON.stringify({version:1,createdAt:new Date().toISOString(),databaseSha256:await digest(join(directory,'database.dump')),attachments},null,2));
 return directory;
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{console.log('Backup completo: '+await backup(readConfig(),process.argv[2]||'backups'));}catch(e){console.error(e.message);process.exitCode=1;}
}
