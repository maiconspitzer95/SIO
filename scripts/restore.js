import { readFile,mkdir,copyFile } from 'node:fs/promises';
import { resolve,join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { digest,pgCommand } from './backup.js';
import { readConfig } from '../server/config/env.js';
import { createPool } from '../server/config/database.js';
export async function restore(config,source,target,destination){
 if(!/^sio_restore_[a-z0-9_]+$/.test(target))throw new Error('Banco de destino deve começar com sio_restore_ e conter apenas letras minúsculas, números e _.');
 const directory=resolve(source),manifest=JSON.parse(await readFile(join(directory,'manifest.json'),'utf8'));
 if(manifest.version!==1||await digest(join(directory,'database.dump'))!==manifest.databaseSha256)throw new Error('Backup inválido ou checksum divergente.');
 for(const a of manifest.attachments){if(!/^[a-f0-9-]+\.(pdf|png|jpg)$/.test(a.armazenamento)||await digest(join(directory,'storage',a.armazenamento))!==a.sha256)throw new Error('Integridade dos anexos divergente.');}
 // Diretório novo e createdb sem sobrescrita; não altera o banco/armazenamento em uso.
 await mkdir(destination,{recursive:false});
 pgCommand(config,'createdb',['--',target]);
 pgCommand(config,'pg_restore',['--exit-on-error','--single-transaction','--no-owner','--dbname',target,join(directory,'database.dump')]);
 for(const a of manifest.attachments)await copyFile(join(directory,'storage',a.armazenamento),join(destination,a.armazenamento));
 const url=new URL(config.DATABASE_URL);url.pathname='/'+target;const pool=createPool({...config,DATABASE_URL:url.toString()});
 try{if((await pool.query("SELECT to_regclass('public.anexos') tabela")).rows[0].tabela)for(const a of (await pool.query('SELECT armazenamento,sha256 FROM anexos')).rows){if(!manifest.attachments.some(b=>b.armazenamento===a.armazenamento&&b.sha256===a.sha256))throw new Error('Anexo referenciado no banco restaurado ausente no backup.');}}finally{await pool.end();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const [source,target,destination]=process.argv.slice(2);if(!source||!target||!destination)throw new Error('Uso: npm run restore -- PASTA_BACKUP sio_restore_validacao PASTA_NOVA_ANEXOS');await restore(readConfig(),source,target,resolve(destination));console.log('Banco e anexos restaurados em destinos novos. Produção preservada.');}catch(e){console.error(e.message);process.exitCode=1;}
}
