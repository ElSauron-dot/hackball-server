const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 3000 });

const FPS = 60;
const FIELD_WIDTH = 600;
const FIELD_HEIGHT = 400;
const GOAL_WIDTH = 100;
const FRICTION = 0.9; // daha yumuşak yavaşlama
const KICK_POWER = 12;
const PLAYER_SPEED_BASE = 4;
const PLAYER_SPEED = PLAYER_SPEED_BASE * 0.6;

let rooms = {};
let scores = {};
let balls = {};
let intervals = {};

function broadcast(roomId, data) {
  if (!rooms[roomId]) return;
  const msg = JSON.stringify(data);
  rooms[roomId].forEach(p => {
    if (p.ws.readyState === 1) p.ws.send(msg);
  });
}

function resetBall(roomId) {
  balls[roomId] = {
    x: FIELD_WIDTH / 2,
    y: FIELD_HEIGHT / 2,
    vx: 0,
    vy: 0,
    radius: 10,
  };
}

function updateBall(roomId) {
  const ball = balls[roomId];
  ball.x += ball.vx;
  ball.y += ball.vy;

  ball.vx *= FRICTION;
  ball.vy *= FRICTION;

  // Yatay sınırlar (top sekmesin, sadece kenarda duracak)
  if (ball.y < ball.radius) ball.y = ball.radius;
  if (ball.y > FIELD_HEIGHT - ball.radius) ball.y = FIELD_HEIGHT - ball.radius;

  // Goller
  if (
    ball.x - ball.radius <= 0 &&
    ball.y > FIELD_HEIGHT / 2 - GOAL_WIDTH / 2 &&
    ball.y < FIELD_HEIGHT / 2 + GOAL_WIDTH / 2
  ) {
    scores[roomId].team2++;
    resetBall(roomId);
  }
  if (
    ball.x + ball.radius >= FIELD_WIDTH &&
    ball.y > FIELD_HEIGHT / 2 - GOAL_WIDTH / 2 &&
    ball.y < FIELD_HEIGHT / 2 + GOAL_WIDTH / 2
  ) {
    scores[roomId].team1++;
    resetBall(roomId);
  }

  // Dikey sınırlar (top sekmesin)
  if (ball.x < ball.radius) ball.x = ball.radius;
  if (ball.x > FIELD_WIDTH - ball.radius) ball.x = FIELD_WIDTH - ball.radius;
}

function updatePlayers(roomId) {
  rooms[roomId].forEach(player => {
    player.x += player.vx;
    player.y += player.vy;

    player.x = Math.min(Math.max(player.radius, player.x), FIELD_WIDTH - player.radius);
    player.y = Math.min(Math.max(player.radius, player.y), FIELD_HEIGHT - player.radius);
  });
}

function gameLoop(roomId) {
  if (!rooms[roomId]) return;

  updatePlayers(roomId);
  updateBall(roomId);

  const ball = balls[roomId];

  rooms[roomId].forEach(player => {
    const dx = ball.x - player.x;
    const dy = ball.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist < ball.radius + player.radius + 5) {
      const playerSpeed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
      const nx = dx / dist;
      const ny = dy / dist;

      // Top hiç sekmesin, sadece sürülecek
      ball.vx = player.vx * 0.7;
      ball.vy = player.vy * 0.7;

      // Top oyuncunun önünde sabitlensin
      ball.x = player.x + nx * (player.radius + ball.radius + 1);
      ball.y = player.y + ny * (player.radius + ball.radius + 1);
    }
  });

  const playersData = rooms[roomId].map(p => ({
    id: p.id,
    x: p.x,
    y: p.y,
    radius: p.radius,
    nickname: p.nickname,
    team: p.team,
  }));

  broadcast(roomId, {
    type: 'gameState',
    players: playersData,
    ball: balls[roomId],
    scores: scores[roomId],
  });
}

server.on('connection', ws => {
  let currentRoom = null;
  const id = Math.random().toString(36).substr(2, 9);
  const player = { id, x: 100, y: FIELD_HEIGHT / 2, radius: 15, team: 1, ws, nickname: '', vx: 0, vy: 0, isHost: false };

  ws.on('message', msg => {
    try {
      const data = JSON.parse(msg);

      if (data.type === 'join') {
        const { roomId: rid, nickname, isHost } = data;
        if (!rid.match(/^[a-z0-9]{6}$/i)) {
          ws.send(JSON.stringify({ type: 'error', message: 'Geçersiz Parti ID' }));
          ws.close();
          return;
        }
        currentRoom = rid;
        player.nickname = nickname;

        if (!rooms[currentRoom]) {
          rooms[currentRoom] = [];
          scores[currentRoom] = { team1: 0, team2: 0 };
          resetBall(currentRoom);
          intervals[currentRoom] = setInterval(() => gameLoop(currentRoom), 1000 / FPS);
        }

        player.team = rooms[currentRoom].length % 2 === 0 ? 1 : 2;
        player.x = player.team === 1 ? 100 : FIELD_WIDTH - 100;
        player.y = FIELD_HEIGHT / 2;
        player.isHost = isHost && rooms[currentRoom].length === 0;

        rooms[currentRoom].push(player);

        ws.send(JSON.stringify({ type: 'init', id }));

        return;
      }

      if (data.type === 'move') {
        if (typeof data.dx === 'number' && typeof data.dy === 'number') {
          player.vx = data.dx * PLAYER_SPEED;
          player.vy = data.dy * PLAYER_SPEED;
        } else {
          player.vx = 0;
          player.vy = 0;
        }
        return;
      }

      if (data.type === 'kick') {
        // Kick butonu şu an işlevsiz bırakıldı, dilersen özelleştirebilirsin
        return;
      }

      if (player.isHost) {
        if (data.type === 'changeTeam') {
          const target = rooms[currentRoom].find(p => p.id === data.target);
          if (target) target.team = target.team === 1 ? 2 : 1;
          return;
        }
        if (data.type === 'kickPlayer') {
          const idx = rooms[currentRoom].findIndex(p => p.id === data.target);
          if (idx !== -1) {
            rooms[currentRoom][idx].ws.close();
            rooms[currentRoom].splice(idx, 1);
          }
          return;
        }
      }
    } catch (e) {
      console.error('Hatalı mesaj:', e);
    }
  });

  ws.on('close', () => {
    if (!currentRoom) return;
    rooms[currentRoom] = rooms[currentRoom].filter(p => p.ws !== ws);
    if (rooms[currentRoom].length === 0) {
      clearInterval(intervals[currentRoom]);
      delete intervals[currentRoom];
      delete rooms[currentRoom];
      delete scores[currentRoom];
      delete balls[currentRoom];
    }
  });
});

console.log('✅ HackBall WebSocket sunucusu ws://localhost:3000 üzerinde çalışıyor');
