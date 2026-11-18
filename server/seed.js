export async function seedDatabase(repo) {
  if ((await repo.get('SELECT id FROM users LIMIT 1'))) return;
  const owner = Number((await repo.run('INSERT INTO users(name,email,location,bio) VALUES (?,?,?,?)',
    'Sunny Paws Rescue', 'rescue@dogdiscovery.demo', 'Portland, OR', 'A demo rescue account helping good dogs find their people.')).insertId);
  (await repo.run('INSERT INTO users(name,email,location,bio) VALUES (?,?,?,?)',
    'Alex Morgan', 'alex@dogdiscovery.demo', 'Portland, OR', 'Weekend trail explorer. Looking for a best friend to share the adventure.'));
  const dogs = [
    ['Maple','Golden Retriever',24,'Large','Female','Portland, OR','The world is a little warmer with Maple in it. This sweet girl loves slow morning walks, a good game of fetch, and curling up next to her favorite person. She is house-trained and would love a home with room to play.',['Gentle soul','Good with kids','Loves walks'],'photo-1552053831-71594a27632d'],
    ['Archie','Chow Chow mix',18,'Medium','Male','Portland, OR','Curious nose, enormous heart. Archie is a cheerful explorer who turns every walk into a tiny adventure. He loves puzzle toys and other dogs. He is learning his manners and would thrive with a patient, active family.',['Playful','Good with dogs','Curious'],'photo-1505628346881-b72b27e84530'],
    ['Luna','Corgi mix',36,'Medium','Female','Seattle, WA','Luna is your future hiking partner and your most loyal friend. Bright, affectionate, and eager to learn, she knows her basic cues and loves having a job to do. A home that enjoys the outdoors would be her perfect match.',['Adventure buddy','Smart cookie','Loyal'],'photo-1551717743-49959800b1f6'],
    ['Milo','Labrador Retriever',8,'Large','Male','Portland, OR','All paws and possibility. Milo is a bouncy young pup with a very serious love of tennis balls. He is still learning about the world and is looking for someone to help him grow into the wonderful dog we know he will be.',['Playful','Puppy energy','Good with dogs'],'photo-1518717758536-85ae29035b6d'],
    ['Olive','Pug mix',60,'Small','Female','Bend, OR','Small dog, big cuddle energy. Olive is happiest under a cozy blanket or on a sunny windowsill. She enjoys short walks and a quiet routine, making her a lovely companion for a calm home.',['Cuddle expert','Easygoing','Apartment friendly'],'photo-1517849845537-4d257902454a'],
    ['Finn','Golden Retriever mix',10,'Medium','Male','Seattle, WA','Finn greets each day like it is the best day ever. An enthusiastic learner, he loves agility games, long walks, and being wherever you are. He would love an experienced, active adopter.',['Active','Smart cookie','Loyal'],'photo-1507146426996-ef05306b995a'],
    ['Winnie','Golden Retriever mix',96,'Large','Female','Salem, OR','Winnie has perfected the art of being a best friend. This gentle senior loves a leisurely stroll and a soft place to nap. She has so much love to give and is ready for a peaceful forever home.',['Gentle soul','Easygoing','Good with kids'],'photo-1633722715463-d30f4f325e24'],
    ['Teddy','Corgi mix',12,'Small','Male','Portland, OR','A happy little shadow with a wag that never stops. Teddy loves meeting people, collecting toys, and making you laugh. He is ready to be part of a family and join in on everyday adventures.',['Friendly','Playful','Apartment friendly'],'photo-1612536057832-2ff7ead58194'],
  ];
  await repo.transaction(async () => {
    for (const [name, breed, age, size, sex, location, description, traits, photo] of dogs) {
      const id = (await repo.run('INSERT INTO dogs(owner_id,name,breed,age_months,size,sex,location,description,traits) VALUES (?,?,?,?,?,?,?,?,?)', owner,name,breed,age,size,sex,location,description,JSON.stringify(traits))).insertId;
      (await repo.run('INSERT INTO dog_images(dog_id,url) VALUES (?,?)',id,`https://images.unsplash.com/${photo}?auto=format&fit=crop&w=1000&q=85`));
    }
  });
}
