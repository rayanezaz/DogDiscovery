import { spawn, execFileSync } from 'node:child_process';
import { access, mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
const directory=resolve('data/postgres-test');
const bin=process.env.PG_BIN || resolve(execFileSync('brew',['--prefix','postgresql@17'],{encoding:'utf8'}).trim(),'bin');
await mkdir(directory,{recursive:true});
const run=(command,args)=>new Promise((resolve,reject)=>{const child=spawn(command,args,{stdio:'inherit'});child.on('error',reject);child.on('exit',code=>code===0?resolve():reject(new Error(`PostgreSQL command failed (${code})`)));});
let initialized=true;try{await access(resolve(directory,'PG_VERSION'));}catch{initialized=false;}
if(!initialized) {
  if(process.env.TEST_DATABASE_URL) throw new Error('Use an existing PostgreSQL test server, or unset TEST_DATABASE_URL to initialize a new isolated one.');
  const password=randomBytes(24).toString('hex');
  const passwordFile=resolve('data/.postgres-test-init-password');
  await writeFile(passwordFile,password,{mode:0o600,flag:'wx'});
  try{await run(resolve(bin,'initdb'),['-D',directory,'-U','dog_discovery_test','-A','scram-sha-256',`--pwfile=${passwordFile}`,'--encoding=UTF8','--locale=C']);}
  finally{await unlink(passwordFile);}
  await writeFile('.env.test',`TEST_DATABASE_URL=postgresql://dog_discovery_test:${password}@127.0.0.1:5433/postgres\n`,{mode:0o600,flag:'wx'});
  console.log('Isolated test database credentials saved to .env.test.');
}
const child=spawn(resolve(bin,'postgres'),['-D',directory,'-h','127.0.0.1','-p','5433','-k',directory],{stdio:'inherit'});
for(const signal of ['SIGINT','SIGTERM'])process.once(signal,()=>child.kill('SIGTERM'));
child.on('error',error=>{console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{process.exitCode=code||0;});
