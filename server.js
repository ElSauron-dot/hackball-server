const WebSocket = require('ws');
const server = new WebSocket.Server({ port: 3000 });

const rooms = {};
const scores = {};

const FIELD_WIDTH = 600;
const FIELD_HEIGHT = 400;
const GOAL_WIDTH = 100;

const FRICTION = 0.85;
const KICK_POWER = 15;
const MAX_PLAYER_SPEED = 3;

function resetBall() {
  return {
    x: FIELD_WIDTH / 2,
    y: FIELD_HEIGHT / 2,
    vx: 0,
    vy: 0,
    radius: 10,
  };
}

const balls = {}; // Oda bazlı top

function broadcast(roomId, data) {
  if (!rooms[roomId]) return;
  const msg = JSON.stringify(data);
  for (const player of rooms[roomId]) {
    if (player.ws.readyState === 1) {
      player.ws.send(msg);
    }
  }
}

function updateBall(roomId) {
  if (!balls[roomId]) return;
  let ball = balls[roomId];

  ball.x += ball.vx;
  ball.y += ball.vy;

  // Hızı azalt ama çok yavaşlayınca durdur
  ball.vx *= FRICTION;
  ball.vy *= FRICTION;
  if (Math.abs(ball.vx) < 0.05) ball.vx = 0;
  if (Math.abs(ball.vy) < 0.05) ball.vy = 0;

  // Duvarlara çarpma (top sektirme yerine duracak)
  if (ball.y < ball.radius) {
    ball.y = ball.radius;
    ball.vy = 0;
  }
  if (ball.y > FIELD_HEIGHT - ball.radius) {
    ball.y = FIELD_HEIGHT - ball.radius;
    ball.vy = 0;
  }

  // Kale kontrolü ve skor
  if (
    ball.x - ball.radius <= 0 &&
    ball.y > FIELD_HEIGHT / 2 - GOAL_WIDTH / 2 &&
    ball.y < FIELD_HEIGHT / 2 + GOAL_WIDTH / 2
  ) {
    scores[roomId].team2++;
    balls[roomId] = resetBall();
  }

  if (
    ball.x + ball.radius >= FIELD_WIDTH &&
    ball.y > FIELD_HEIGHT / 2 - GOAL_WIDTH / 2 &&
    ball.y < FIELD_HEIGHT / 2 + GOAL_WIDTH / 2
  ) {
    scores[roomId].team1++;
    balls[roomId] = resetBall();
  }

  // Sadece durdur, sekme yok, duvar sınırları
  if (ball.x < ball.radius) {
    ball.x = ball.radius;
    ball.vx = 0;
  }
  if (ball.x > FIELD_WIDTH - ball.radius) {
    ball.x = FIELD_WIDTH - ball.radius;
    ball.vx = 0;
  }
}

server.on('connection', ws => {
  let currentRoom = null;
  let player = { x: 100, y: 100, nickname: '', ws, radius: 15, team: 1, id: null };

  ws.on('message', msg => {
    try {
      const data = JSON.parse(msg);

      if (data.type === 'join') {
        const { roomId: rid, nickname } = data;
        currentRoom = rid;

        if (!rooms[currentRoom]) rooms[currentRoom] = [];
        if (!scores[currentRoom]) scores[currentRoom] = { team1: 0, team2: 0 };
        if (!balls[currentRoom]) balls[currentRoom] = resetBall();

        player.id = (Math.random() + 1).toString(36).substring(2, 9);
        player.nickname = nickname;
        player.team = rooms[currentRoom].length % 2 === 0 ? 1 : 2;

        player.x = player.team === 1 ? 100 : FIELD_WIDTH - 100;
        player.y = FIELD_HEIGHT / 2;

        rooms[currentRoom].push(player);

        // Yeni oyuncuya id gönder
        ws.send(JSON.stringify({ type: 'init', id: player.id }));
        return;
      }

      if (data.type === 'move') {
        const speed = MAX_PLAYER_SPEED;
        if (data.dx && data.dy) {
          player.x += data.dx * speed;
          player.y += data.dy * speed;

          player.x = Math.max(player.radius, Math.min(FIELD_WIDTH - player.radius, player.x));
          player.y = Math.max(player.radius, Math.min(FIELD_HEIGHT - player.radius, player.y));

          // Eğer top oyuncuya yakınsa topu sürebilsin (topu sürme mekaniği)
          let ball = balls[currentRoom];
          const dx = ball.x - player.x;
          const dy = ball.y - player.y;
          const dist = Math.sqrt(dx*dx + dy*dy);

          if (dist < player.radius + ball.radius + 5) {
            // Topun hızı oyuncunun hareketine göre az az değişir (sürme efekti)
            ball.vx = data.dx * speed * 0.6;
            ball.vy = data.dy * speed * 0.6;

            // Top pozisyonunu oyuncunun biraz önüne çekelim
            ball.x = player.x + data.dx * (player.radius + ball.radius + 2);
            ball.y = player.y + data.dy * (player.radius + ball.radius + 2);
          }
        }
      }

      if (data.type === 'kick') {
        // Şut çekme, topa sert vurma
        let ball = balls[currentRoom];
        const dx = ball.x - player.x;
        const dy = ball.y - player.y;
        const dist = Math.sqrt(dx*dx + dy*dy);

        if (dist < player.radius + ball.radius + 5) {
          // Vuruş yönü normalize edilir
          ball.vx = (dx / dist) * KICK_POWER;
          ball.vy = (dy / dist) * KICK_POWER;
        }
      }

      // Burada diğer mesaj tiplerini işleyebilirsin (takım değiştirme vs)

    } catch (e) {
      console.log('Hatalı mesaj:', e);
    }
  });

  const interval = setInterval(() => {
    if (!currentRoom) return;

    updateBall(currentRoom);

    const playersData = rooms[currentRoom].map(p => ({
      id: p.id,
      x: p.x,
      y: p.y,
      nickname: p.nickname,
      radius: p.radius,
      team: p.team,
    }));

    broadcast(currentRoom, {
      type: 'gameState',
      players: playersData,
      ball: balls[currentRoom],
      scores: scores[currentRoom]
    });
  }, 1000 / 60);

  ws.on('close', () => {
    if (!currentRoom) return;

    rooms[currentRoom] = rooms[currentRoom].filter(p => p.ws !== ws);

    if (rooms[currentRoom].length === 0) {
      delete rooms[currentRoom];
      delete scores[currentRoom];
      delete balls[currentRoom];
    }

    clearInterval(interval);
  });
});

console.log('✅ HackBall WebSocket sunucusu ws://localhost:3000 üzerinde çalışıyor');
