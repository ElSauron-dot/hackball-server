const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 3000 });

const rooms = {};
const scores = {};

let ball = {
  x: 300,
  y: 200,
  vx: 0,
  vy: 0,
  radius: 10,
};

const FIELD_WIDTH = 600;
const FIELD_HEIGHT = 400;
const GOAL_WIDTH = 100;

const FRICTION = 0.95;
const KICK_POWER = 10;

function broadcast(roomId, data) {
  if (!rooms[roomId]) return;
  const msg = JSON.stringify(data);
  for (const player of rooms[roomId]) {
    if (player.ws.readyState === 1) {
      player.ws.send(msg);
    }
  }
}

function resetBall() {
  ball.x = FIELD_WIDTH / 2;
  ball.y = FIELD_HEIGHT / 2;
  ball.vx = 0;
  ball.vy = 0;
}

function updateBall(roomId) {
  ball.x += ball.vx;
  ball.y += ball.vy;

  ball.vx *= FRICTION;
  ball.vy *= FRICTION;

  // Duvarlara çarpma (y yönü)
  if (ball.y < ball.radius) {
    ball.y = ball.radius;
    ball.vy = -ball.vy * 0.7;
  }
  if (ball.y > FIELD_HEIGHT - ball.radius) {
    ball.y = FIELD_HEIGHT - ball.radius;
    ball.vy = -ball.vy * 0.7;
  }

  // Kaleler ve skor kontrolü
  // Sol kale (team2 skoru)
  if (
    ball.x - ball.radius <= 0 &&
    ball.y > FIELD_HEIGHT / 2 - GOAL_WIDTH / 2 &&
    ball.y < FIELD_HEIGHT / 2 + GOAL_WIDTH / 2
  ) {
    scores[roomId].team2++;
    resetBall();
  }

  // Sağ kale (team1 skoru)
  if (
    ball.x + ball.radius >= FIELD_WIDTH &&
    ball.y > FIELD_HEIGHT / 2 - GOAL_WIDTH / 2 &&
    ball.y < FIELD_HEIGHT / 2 + GOAL_WIDTH / 2
  ) {
    scores[roomId].team1++;
    resetBall();
  }

  // Sağ ve sol duvar sınırı
  if (ball.x < ball.radius) {
    ball.x = ball.radius;
    ball.vx = -ball.vx * 0.7;
  }
  if (ball.x > FIELD_WIDTH - ball.radius) {
    ball.x = FIELD_WIDTH - ball.radius;
    ball.vx = -ball.vx * 0.7;
  }
}

server.on('connection', ws => {
  let currentRoom = null;
  let player = { x: 100, y: 100, nickname: '', ws, radius: 15, team: 1 };

  ws.on('message', msg => {
    try {
      const data = JSON.parse(msg);

      if (data.type === 'join') {
        const { roomId, nickname } = data;
        currentRoom = roomId;
        player.nickname = nickname;

        if (!rooms[currentRoom]) rooms[currentRoom] = [];
        if (!scores[currentRoom]) scores[currentRoom] = { team1: 0, team2: 0 };

        player.team = rooms[currentRoom].length % 2 === 0 ? 1 : 2;

        if (player.team === 1) {
          player.x = 100;
          player.y = FIELD_HEIGHT / 2;
        } else {
          player.x = FIELD_WIDTH - 100;
          player.y = FIELD_HEIGHT / 2;
        }

        rooms[currentRoom].push(player);
      }

      if (data.type === 'move') {
        const speed = 5;
        if (data.dir === 'left') player.x -= speed;
        if (data.dir === 'right') player.x += speed;
        if (data.dir === 'up') player.y -= speed;
        if (data.dir === 'down') player.y += speed;

        player.x = Math.max(player.radius, Math.min(FIELD_WIDTH - player.radius, player.x));
        player.y = Math.max(player.radius, Math.min(FIELD_HEIGHT - player.radius, player.y));
      }

      if (data.type === 'kick') {
        const dx = ball.x - player.x;
        const dy = ball.y - player.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        if (dist < player.radius + ball.radius + 5) {
          ball.vx = (dx / dist) * KICK_POWER;
          ball.vy = (dy / dist) * KICK_POWER;
        }
      }
    } catch (e) {
      console.log('Hatalı mesaj:', e);
    }
  });

  const interval = setInterval(() => {
    if (!currentRoom) return;

    updateBall(currentRoom);

    const playersData = rooms[currentRoom].map(p => ({
      x: p.x,
      y: p.y,
      nickname: p.nickname,
      radius: p.radius,
      team: p.team,
    }));

    broadcast(currentRoom, {
      type: 'gameState',
      players: playersData,
      ball: ball,
      scores: scores[currentRoom]
    });
  }, 1000 / 30);

  ws.on('close', () => {
    if (!currentRoom) return;
    rooms[currentRoom] = rooms[currentRoom].filter(p => p.ws !== ws);
    if (rooms[currentRoom].length === 0) {
      delete rooms[currentRoom];
      delete scores[currentRoom];
      resetBall();
    }
    clearInterval(interval);
  });
});

console.log('✅ HackBall WebSocket sunucusu ws://localhost:3000 üzerinde çalışıyor');
