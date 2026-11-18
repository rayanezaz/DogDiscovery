import mysql from 'mysql2/promise';
import { createRepository } from '../server/database.js';
export const importColumns = {
  users:['id','name','email','location','bio','avatar','created_at'],
  images:['id','owner_id','url','created_at'],
  dogs:['id','owner_id','name','breed','age_months','size','sex','location','description','traits','status','created_at'],
  dog_images:['dog_id','url','position'],favorites:['user_id','dog_id'],
  adoptions:['id','dog_id','applicant_id','note','status','created_at'],
  conversations:['id','dog_id','member_id'],messages:['id','conversation_id','sender_id','body','created_at'],
};
export async function importRecords(target, snapshot) {
  return target.transaction(async()=>{
    for(const table of Object.keys(importColumns)) {
      if((await target.get(`SELECT COUNT(*) AS n FROM ${table}`)).n!==0) throw new Error('Import requires an empty PostgreSQL target. No existing target records were changed.');
    }
    const counts={};
    for(const [table,columns] of Object.entries(importColumns)) {
      const rows=snapshot[table];
      if(!Array.isArray(rows)) throw new Error(`Missing source table: ${table}`);
      for(const row of rows) {
        const values=columns.map(column=>column==='email'?row[column].toLowerCase():row[column]);
        await target.run(`INSERT INTO ${table} (${columns.join(',')}) VALUES (${columns.map(()=>'?').join(',')})`,...values);
      }
      counts[table]=(await target.get(`SELECT COUNT(*) AS n FROM ${table}`)).n;
      if(counts[table]!==rows.length) throw new Error(`Row count mismatch: ${table}`);
    }
    for(const table of ['users','dogs','adoptions','conversations','messages']) {
      await target.get(`SELECT setval(pg_get_serial_sequence('dog_discovery.${table}','id'),COALESCE(MAX(id),1),MAX(id) IS NOT NULL) FROM ${table}`);
    }
    return counts;
  });
}
async function main() {
  const source=await mysql.createConnection({host:process.env.MYSQL_HOST||'127.0.0.1',port:Number(process.env.MYSQL_PORT||3307),database:process.env.MYSQL_DATABASE||'dog_discovery',user:process.env.MYSQL_USER||'dog_discovery',password:process.env.MYSQL_PASSWORD||'',dateStrings:true});
  let target;
  try {
    await source.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
    await source.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
    const snapshot={};
    for(const [table,columns] of Object.entries(importColumns)) {
      [snapshot[table]]=await source.query(`SELECT ${columns.map(c=>`\`${c}\``).join(',')} FROM \`${table}\``);
    }
    target=await createRepository();
    console.log('Imported records:',await importRecords(target,snapshot));
    console.log('MySQL and uploaded files were preserved. Users must sign in through Supabase with the same verified email; old passwords and sessions were not copied.');
  } finally {await source.rollback();await source.end();await target?.close();}
}
if(process.argv[1] && new URL(import.meta.url).pathname===process.argv[1]) await main();
