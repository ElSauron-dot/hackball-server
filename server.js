const WebSocket = require("ws");
const http = require("http");
const { v4: uuid } = require("uuid");

const server = http.createServer();
const wss = new WebSocket.Server({ server });

let parties = {};

function createBall() {
  return { x: 400, y: 250, vx: 0, vy: 0 };
}

function broadcast(partyId, data) {
  const msg = JSON.stringify(data);
  Object.values(parties[partyId].players).forEach(p => p.ws.send(msg));
}

function updateGame(party) {
  const ball = party.ball;

  // Topu hareket ettir
  ball.x += ball.vx;
  ball.y += ball.vy;

  // Saha sınırları
  if (ball.x < 12 || ball.x > 788) ball.vx *= -1;
  if (ball.y < 12 || ball.y > 488) ball.vy *= -1;

  // Oyuncularla çarpışma
  for (const player of Object.values(party.players)) {
    const dx = ball.x - player.x;
    const dy = ball.y - player.y;
    const dist = Math.hypot(dx, dy);
    if (dist < 27) {
      const angle = Math.atan2(dy, dx);
      ball.vx = Math.cos(angle) * 5;
      ball.vy = Math.sin(angle) * 5;
    }
  }
}

wss.on("connection", ws => {
  let playerId, partyId;

  ws.on("message", message => {
    const data = JSON.parse(message);

    if (data.type === "join") {
      playerId = uuid();
      partyId = uuid().slice(0, 5);

      parties[partyId] = parties[partyId] || {
        players: {},
        ball: createBall(),
        creator: playerId,
        startTime: Date.now()
      };

      parties[partyId].players[playerId] = {
        id: playerId,
        nickname: data.nickname,
        x: data.team === "red" ? 100 : 700,
        y: 250,
        team: data.team,
        keys: {},
        ws
      };

      ws.send(JSON.stringify({ type: "state", id: playerId }));
    }

    if (data.type === "keydown" || data.type === "keyup") {
      if (!parties[partyId] || !parties[partyId].players[playerId]) return;
      parties[partyId].players[playerId].keys[data.key] = data.type === "keydown";
    }

    if (data.type === "changeTeam") {
      if (parties[partyId]?.creator === playerId && parties[partyId].players[data.id]) {
        parties[partyId].players[data.id].team = data.team;
      }
    }

    if (data.type === "kick") {
      if (parties[partyId]?.creator === playerId) {
        parties[partyId].players[data.id]?.ws.close();
        delete parties[partyId].players[data.id];
      }
    }
  });

  ws.on("close", () => {
    if (parties[partyId]) {
      delete parties[partyId].players[playerId];
      if (Object.keys(parties[partyId].players).length === 0) {
        delete parties[partyId];
      }
    }
  });
});

setInterval(() => {
  for (const [id, party] of Object.entries(parties)) {
    for (const p of Object.values(party.players)) {
      const speed = 4;
      if (p.keys["ArrowUp"]) p.y -= speed;
      if (p.keys["ArrowDown"]) p.y += speed;
      if (p.keys["ArrowLeft"]) p.x -= speed;
      if (p.keys["ArrowRight"]) p.x += speed;
    }

    updateGame(party);

    broadcast(id, {
      type: "state",
      players: Object.fromEntries(Object.entries(party.players).map(([id, p]) => [id, {
        x: p.x, y: p.y, nickname: p.nickname, team: p.team
      }])),
      ball: party.ball,
      id: party.creator,
      partyId: id,
      creator: party.creator
    });
  }
}, 1000 / 60);

server.listen(3000, () => console.log("✅ HackBall WebSocket server 3000 portunda çalışıyor"));
