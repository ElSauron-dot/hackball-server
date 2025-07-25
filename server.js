const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 3000 });
const FPS = 60;
const FRAME_TIME = 1000 / FPS;
const FIELD_WIDTH = 600;
const FIELD_HEIGHT = 400;
const GOAL_WIDTH = 100;
const FRICTION = 0.95;
const KICK_POWER = 14;
const STICK_SPEED = 2;

let rooms = {};
let scores = {};
let balls = {};
let intervals = {};

function broadcast(roomId, data) {
  if (!rooms[roomId]) return;
  const msg = JSON.stringify(data);
  rooms[roomId].forEach(p => {
    if (p.ws.readyState === 1) {
      p.ws.send(msg);
    }
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

  // Y ekseninde duvar çarpması
  if (ball.y < ball.radius) {
    ball.y = ball.radius;
    ball.vy = -ball.vy * 0.7;
  }
  if (ball.y > FIELD_HEIGHT - ball.radius) {
    ball.y = FIELD_HEIGHT - ball.radius;
    ball.vy = -ball.vy * 0.7;
  }

  // Goller ve skor kontrolü
  // Sol kale (takım 2 skoru)
  if (
    ball.x - ball.radius <= 0 &&
    ball.y > FIELD_HEIGHT / 2 - GOAL_WIDTH / 2 &&
    ball.y < FIELD_HEIGHT / 2 + GOAL_WIDTH / 2
  ) {
    scores[roomId].team2++;
    resetBall(roomId);
  }

  // Sağ kale (takım 1 skoru)
  if (
    ball.x + ball.radius >= FIELD_WIDTH &&
    ball.y > FIELD_HEIGHT / 2 - GOAL_WIDTH / 2 &&
    ball.y < FIELD_HEIGHT / 2 + GOAL_WIDTH / 2
  ) {
    scores[roomId].team1++;
    resetBall(roomId);
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

function gameLoop(roomId) {
  if (!rooms[roomId]) return;

  updateBall(roomId);

  // Top ve oyuncu çarpışması
  const ball = balls[roomId];
  rooms[roomId].forEach(player => {
    const dx = ball.x - player.x;
    const dy = ball.y - player.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < ball.radius + player.radius + 1) {
      const speed = Math.sqrt(ball.vx * ball.vx + ball.vy * ball.vy);
      const nx = dx / dist;
      const ny = dy / dist;

      if (speed > STICK_SPEED) {
        // Hızlı ise sek
        ball.vx = nx * KICK_POWER;
        ball.vy = ny * KICK_POWER;
      } else {
        // Yavaş ise sür (topu yapıştır)
        ball.vx = 0;
        ball.vy = 0;
        ball.x = player.x + nx * (player.radius + ball.radius + 1);
        ball.y = player.y + ny * (player.radius + ball.radius + 1);
      }
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
  const player = { id, x: 100, y: FIELD_HEIGHT / 2, radius: 15, team: 1, ws, nickname: '' };

  ws.on('message', msg => {
    try {
      const data = JSON.parse(msg);

      if (data.type === 'join') {
        const { roomId, nickname } = data;
        if (!roomId.match(/^[a-z0-9]{6}$/i)) {
          ws.send(JSON.stringify({ type: 'error', message: 'Geçersiz Parti ID' }));
          ws.close();
          return;
        }
        currentRoom = roomId;
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

        rooms[currentRoom].push(player);

        ws.send(JSON.stringify({ type: 'init', id }));
      }

      if (data.type === 'move') {
        const speed = 3.5;
        if (data.dir === 'left') player.x -= speed;
        if (data.dir === 'right') player.x += speed;
        if (data.dir === 'up') player.y -= speed;
        if (data.dir === 'down') player.y += speed;

        player.x = Math.max(player.radius, Math.min(FIELD_WIDTH - player.radius, player.x));
        player.y = Math.max(player.radius, Math.min(FIELD_HEIGHT - player.radius, player.y));
      }

      if (data.type === 'kick') {
        // Topa vurma zaten loop içinde yapılıyor
      }

      // Yönetici (oda sahibi) yetkileri
      if (data.type === 'changeTeam' && rooms[currentRoom][0] === player) {
        const target = rooms[currentRoom].find(p => p.id === data.target);
        if (target) target.team = target.team === 1 ? 2 : 1;
      }

      if (data.type === 'kickPlayer' && rooms[currentRoom][0] === player) {
        const idx = rooms[currentRoom].findIndex(p => p.id === data.target);
        if (idx !== -1) {
          rooms[currentRoom][idx].ws.close();
          rooms[currentRoom].splice(idx, 1);
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
