const fs = require('fs');
const https = require('https');
const path = require('path');

const emojis = [
  'Person', 'Man', 'Woman', 'Ninja', 'Vampire', 'Zombie', 'Astronaut', 'Cook', 'Farmer',
  'Firefighter', 'Judge', 'Mechanic', 'Pilot', 'Scientist', 'Singer', 'Student', 'Teacher',
  'Police%20officer', 'Construction%20worker', 'Detective', 'Superhero'
];

const dir = path.join(__dirname, 'nash-chat-avatars');
if (!fs.existsSync(dir)) fs.mkdirSync(dir);

let downloaded = 0;

emojis.forEach(e => {
  const url = `https://raw.githubusercontent.com/microsoft/fluentui-emoji/main/assets/${e}/3D/${e.toLowerCase()}_3d.png`;
  const file = path.join(dir, `${e.replace('%20', '_')}.png`);
  https.get(url, (res) => {
    if (res.statusCode === 200) {
      res.pipe(fs.createWriteStream(file));
      downloaded++;
    }
  });
});

setTimeout(() => {
  console.log(`Downloaded ${downloaded} 3D avatars.`);
  console.log(fs.readdirSync(dir).join(', '));
}, 3000);
