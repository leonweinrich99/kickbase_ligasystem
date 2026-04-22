const fs = require('fs');
const path = require('path');

const historyDir = 'c:/Users/lw73404/code/Kickbase tool/frontend/public/history';

const md28 = JSON.parse(fs.readFileSync(path.join(historyDir, 'spieltag-28.json'), 'utf8'));
const md29 = JSON.parse(fs.readFileSync(path.join(historyDir, 'spieltag-29.json'), 'utf8'));
const md30 = JSON.parse(fs.readFileSync(path.join(historyDir, 'spieltag-30.json'), 'utf8'));

const getMatchdayPointsMap = (data) => {
    const map = new Map();
    data.leagues.forEach(l => {
        l.users.forEach(u => {
            const points = parseInt(u.pointsMatchday.replace(/\./g, '')) || 0;
            map.set(u.id, points);
        });
    });
    return map;
};

const md28Map = getMatchdayPointsMap(md28);
const md29Map = getMatchdayPointsMap(md29);

md30.leagues.forEach(l => {
    l.users.forEach(u => {
        const totalPoints = parseInt(u.points.replace(/\./g, '')) || 0;
        const p28 = md28Map.get(u.id) || 0;
        const p29 = md29Map.get(u.id) || 0;
        const matchdayPoints = totalPoints - p28 - p29;
        
        u.pointsMatchday = matchdayPoints.toLocaleString('de-DE');
    });
});

fs.writeFileSync(path.join(historyDir, 'spieltag-30.json'), JSON.stringify(md30, null, 2), 'utf8');
console.log('spieltag-30.json successfully updated.');
