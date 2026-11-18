import { HttpError } from './validation.js';

export function createServices(repo) {
  const dog = async id => {
    const row = (await repo.get(`SELECT d.*,u.name AS owner_name,u.bio AS owner_bio FROM dogs d JOIN users u ON u.id=d.owner_id WHERE d.id=?`, id));
    if (!row) throw new HttpError(404, 'This dog could not be found.');
    return { ...row, traits: JSON.parse(row.traits), images: (await repo.all('SELECT url FROM dog_images WHERE dog_id=? ORDER BY position', id)).map(x => x.url) };
  };
  const ownedDog = async (id, user) => {
    const row = (await dog(id));
    if (row.owner_id !== user.id) throw new HttpError(403, 'Only the listing owner can make this change.');
    return row;
  };
  const checkImages = async (urls, user, existing = []) => {
    for (const url of urls) {
      if (!existing.includes(url) && !(await repo.get('SELECT id FROM images WHERE url=? AND owner_id=?', url, user.id)))
        throw new HttpError(400, 'Use photos uploaded by your account.');
    }
  };
  const thread = async (id, user) => {
    const row = (await repo.get(`SELECT c.*,d.owner_id,d.name AS dog_name FROM conversations c JOIN dogs d ON d.id=c.dog_id WHERE c.id=?`, id));
    if (!row || (row.member_id !== user.id && row.owner_id !== user.id)) throw new HttpError(404, 'Conversation not found.');
    return row;
  };
  return {
    dog, ownedDog, checkImages, thread,
    async listDogs(query, user) {
      const where = []; const params = [];
      if (query.mine === 'true') {
        if (!user) throw new HttpError(401, 'Sign in to see your listings.');
        where.push('d.owner_id=?'); params.push(user.id);
      } else if (query.saved === 'true') {
        if (!user) throw new HttpError(401, 'Sign in to see saved dogs.');
        where.push('EXISTS(SELECT 1 FROM favorites f WHERE f.dog_id=d.id AND f.user_id=?)'); params.push(user.id);
      } else { where.push("d.status='available'"); }
      if (query.q) { where.push('(d.name ILIKE ? OR d.breed ILIKE ? OR d.location ILIKE ?)'); params.push(...Array(3).fill(`%${String(query.q).slice(0,100)}%`)); }
      for (const field of ['size', 'sex']) if (query[field]) { where.push(`d.${field}=?`); params.push(String(query[field])); }
      if (query.location) { where.push('d.location ILIKE ?'); params.push(`%${String(query.location).slice(0,100)}%`); }
      const ages = { puppy: 'd.age_months<12', adult: 'd.age_months BETWEEN 12 AND 83', senior: 'd.age_months>=84' };
      if (ages[query.age]) where.push(ages[query.age]);
      const order = query.sort === 'youngest' ? 'd.age_months ASC,d.id DESC' : query.sort === 'name' ? 'd.name ASC' : 'd.id ASC';
      return Promise.all((await repo.all(`SELECT d.id FROM dogs d WHERE ${where.join(' AND ') || '1=1'} ORDER BY ${order}`, ...params)).map(x => dog(x.id)));
    },
    async saveDog(input, user, dogId) {
      return repo.transaction(async () => {
      if (dogId) await repo.get('SELECT id FROM dogs WHERE id=? FOR UPDATE',dogId);
      const old = dogId ? (await ownedDog(dogId, user)) : null;
      if (old?.status === 'adopted') throw new HttpError(409, 'An adopted listing is kept as a record and cannot be edited.');
      (await checkImages(input.images, user, old?.images));
        const values = [input.name,input.breed,input.age_months,input.size,input.sex,input.location,input.description,JSON.stringify(input.traits),input.status];
        let resultId = dogId;
        if (dogId) (await repo.run('UPDATE dogs SET name=?,breed=?,age_months=?,size=?,sex=?,location=?,description=?,traits=?,status=? WHERE id=?',...values,dogId));
        else resultId = Number((await repo.run('INSERT INTO dogs(name,breed,age_months,size,sex,location,description,traits,status,owner_id) VALUES (?,?,?,?,?,?,?,?,?,?)',...values,user.id)).insertId);
        (await repo.run('DELETE FROM dog_images WHERE dog_id=?',resultId));
        for (const [i,url] of input.images.entries()) await repo.run('INSERT INTO dog_images(dog_id,url,position) VALUES (?,?,?)',resultId,url,i);
        return (await dog(resultId));
      });
    },
    async deleteDog(id, user) {
      return repo.transaction(async () => {
      await repo.get('SELECT id FROM dogs WHERE id=? FOR UPDATE',id);
      const row = (await ownedDog(id, user));
      if (row.status === 'adopted') throw new HttpError(409, 'Adopted listings are preserved with their adoption records.');
      (await repo.run('DELETE FROM dogs WHERE id=?', id));
      });
    },
    async apply(id, user, note) {
      return repo.transaction(async () => {
      await repo.get('SELECT id FROM dogs WHERE id=? FOR UPDATE',id);
      const row = (await dog(id));
      if (row.owner_id === user.id) throw new HttpError(400, 'You cannot apply for your own dog.');
      if (row.status !== 'available') throw new HttpError(409, 'This dog is no longer accepting applications.');
      if ((await repo.get('SELECT id FROM adoptions WHERE dog_id=? AND applicant_id=?',id,user.id))) throw new HttpError(409, 'You already have an application for this dog.');
      const result = (await repo.run('INSERT INTO adoptions(dog_id,applicant_id,note) VALUES (?,?,?)',id,user.id,note));
      return (await repo.get('SELECT * FROM adoptions WHERE id=?',result.insertId));
      });
    },
    async decide(id, user, status) {
      return repo.transaction(async () => {
        const application = await repo.get('SELECT dog_id FROM adoptions WHERE id=?',id);
        if (!application) throw new HttpError(404, 'Application not found.');
        await repo.get('SELECT id FROM dogs WHERE id=? FOR UPDATE',application.dog_id);
        const row = (await repo.get('SELECT a.*, d.owner_id,d.status AS dog_status FROM adoptions a JOIN dogs d ON d.id=a.dog_id WHERE a.id=?',id));
        if (!row) throw new HttpError(404, 'Application not found.');
        if (status === 'withdrawn' ? row.applicant_id !== user.id : row.owner_id !== user.id) throw new HttpError(403, 'You cannot change this application.');
        if (row.status !== 'pending') throw new HttpError(409, 'This application has already been resolved.');
        if (status === 'accepted' && row.dog_status !== 'available') throw new HttpError(409, 'The listing must be available before accepting an application.');
        (await repo.run('UPDATE adoptions SET status=? WHERE id=?',status,id));
        if (status === 'accepted') {
          (await repo.run("UPDATE dogs SET status='adopted' WHERE id=?",row.dog_id));
          (await repo.run("UPDATE adoptions SET status='rejected' WHERE dog_id=? AND id<>? AND status='pending'",row.dog_id,id));
        }
        return (await repo.get('SELECT * FROM adoptions WHERE id=?',id));
      });
    },
    async applications(user) {
      return (await repo.all(`SELECT a.*,d.name AS dog_name,d.owner_id,u.name AS applicant_name,
        (SELECT url FROM dog_images WHERE dog_id=d.id ORDER BY position LIMIT 1) AS image
        FROM adoptions a JOIN dogs d ON d.id=a.dog_id JOIN users u ON u.id=a.applicant_id
        WHERE a.applicant_id=? OR d.owner_id=? ORDER BY a.id DESC`,user.id,user.id));
    },
    async startConversation(id, user, body) {
      const row = (await dog(id));
      if (row.owner_id === user.id) throw new HttpError(400, 'You cannot message yourself.');
      return repo.transaction(async () => {
        (await repo.run('INSERT INTO conversations(dog_id,member_id) VALUES (?,?) ON CONFLICT (dog_id,member_id) DO NOTHING',id,user.id));
        const conversation = (await repo.get('SELECT id FROM conversations WHERE dog_id=? AND member_id=?',id,user.id));
        (await repo.run('INSERT INTO messages(conversation_id,sender_id,body) VALUES (?,?,?)',conversation.id,user.id,body));
        return conversation;
      });
    },
    async conversations(user) {
      return (await repo.all(`SELECT c.id,c.dog_id,d.name AS dog_name,
        CASE WHEN d.owner_id=? THEN member.name ELSE owner.name END AS participant,
        (SELECT url FROM dog_images WHERE dog_id=d.id ORDER BY position LIMIT 1) AS image,
        (SELECT body FROM messages WHERE conversation_id=c.id ORDER BY id DESC LIMIT 1) AS last_message,
        (SELECT MAX(id) FROM messages WHERE conversation_id=c.id) AS last_id
        FROM conversations c JOIN dogs d ON d.id=c.dog_id JOIN users member ON member.id=c.member_id
        JOIN users owner ON owner.id=d.owner_id WHERE c.member_id=? OR d.owner_id=? ORDER BY last_id DESC`,user.id,user.id,user.id));
    },
  };
}
