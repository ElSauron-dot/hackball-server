const WebSocket = require('ws');
const wss = new WebSocket.Server({ port: 3000 });
const { v4: uuid } = require('uuid');

let parties = {};

wss.on('connection', ws => {
  let pid = null, id = uuid();

  ws.on('message', msg => {
    let data = JSON.parse(msg);

    if (data.type === 'createParty') {
      pid = Math.random().toString(36).substr(2, 5).toUpperCase();
      parties[pid] = { leader: id, players: {} };
      parties[pid].players[id] = { nick: data.nick, x: 100, y: 270, team: 'red' };
      ws.send(JSON.stringify({ type: 'init', id, partyId: pid, leader: true }));
    }

    else if (data.type === 'joinParty' && parties[data.partyId]) {
      pid = data.partyId;
      parties[pid].players[id] = { nick: data.nick, x: 860, y: 270, team: 'blue' };
      ws.send(JSON.stringify({ type: 'init', id, partyId: pid, leader: false }));
    }

    else if (data.type === 'input') {
      const p = parties[pid]?.players[id];
      if (!p) return;
      const speed = 5;
      if (data.keys.w || data.keys.arrowup) p.y -= speed;
      if (data.keys.s || data.keys.arrowdown) p.y += speed;
      if (data.keys.a || data.keys.arrowleft) p.x -= speed;
      if (data.keys.d || data.keys.arrowright) p.x += speed;
    }

    else if (data.type === 'changeTeam') {
      if (id === parties[pid]?.leader) {
        parties[pid].players[data.id].team = data.team;
      }
    }

    else if (data.type === 'kickPlayer') {
      if (id === parties[pid]?.leader) {
        delete parties[pid].players[data.id];
      }
    }

    else if (data.type === 'transferLeader') {
      if (id === parties[pid]?.leader) {
        parties[pid].leader = data.id;
      }
    }
  });

  const interval = setInterval(() => {
    if (!pid || !parties[pid]) return;
    const state = {
      type: 'state',
      players: parties[pid].players,
      ball: { x: 480, y: 270 } // henüz sabit
    };
    wss.clients.forEach(c => c.send(JSON.stringify(state)));
  }, 1000 / 50);

  ws.on('close', () => {
    if (parties[pid]) delete parties[pid].players[id];
  });
});
