const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const rooms = {}; // { roomId: { players: Map, ball: {}, interval: ID } }

function createPlayer(nickname) {
  return {
    nickname,
    x: Math.random() * 500 + 50,
    y: Math.random() * 300 + 50,
    dx: 0,
    dy: 0,
    speed: 2.5,
    pressing: { up: false, down: false, left: false, right: false },
  };
}

function createBall() {
  return {
    x: 300,
    y: 200,
    dx: 0,
    dy: 0,
    radius: 10,
    friction: 0.98,
  };
}

wss.on('connection', (ws) => {
  let roomId = '';
  let playerId = '';

  ws.on('message', (msg) => {
    let data;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      return;
    }

    if (data.type === 'join') {
      const { nickname, roomId: rid } = data;
      roomId = rid;

      if (!rooms[roomId]) {
        rooms[roomId] = {
          players: new Map(),
          ball: createBall(),
        };

        startGameLoop(roomId);
      }

      playerId = generateId();
      const player = createPlayer(nickname);
      rooms[roomId].players.set(playerId, { ws, ...player });

    } else if (data.type === 'move') {
      const room = rooms[roomId];
      if (!room || !room.players.has(playerId)) return;

      const player = room.players.get(playerId);
      player.pressing[data.dir] = true;

      setTimeout(() => {
        if (player.pressing) player.pressing[data.dir] = false;
      }, 100); // tuş basımı kısa sürede biter
    }
  });

  ws.on('close', () => {
    const room = rooms[roomId];
    if (room && room.players.has(playerId)) {
      room.players.delete(playerId);
      if (room.players.size === 0) {
        clearInterval(room.interval);
        delete rooms[roomId];
      }
    }
  });
});

function startGameLoop(roomId) {
  const FPS = 60;
  rooms[roomId].interval = setInterval(() => {
    const room = rooms[roomId];
    const ball = room.ball;

    // Oyuncu hareketi
    for (let [id, player] of room.players.entries()) {
      let dx = 0, dy = 0;
      if (player.pressing.up) dy -= 1;
      if (player.pressing.down) dy += 1;
      if (player.pressing.left) dx -= 1;
      if (player.pressing.right) dx += 1;

      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0) {
        dx /= len;
        dy /= len;
        player.x += dx * player.speed;
        player.y += dy * player.speed;

        // Topa çarpma kontrolü
        const dist = Math.hypot(player.x - ball.x, player.y - ball.y);
        if (dist < 15 + ball.radius) {
          let angle = Math.atan2(ball.y - player.y, ball.x - player.x);
          ball.dx += Math.cos(angle) * 1.5;
          ball.dy += Math.sin(angle) * 1.5;
        }
      }

      // Sınır kontrolü
      player.x = Math.max(15, Math.min(585, player.x));
      player.y = Math.max(15, Math.min(385, player.y));
    }

    // Top fiziği
    ball.x += ball.dx;
    ball.y += ball.dy;
    ball.dx *= ball.friction;
    ball.dy *= ball.friction;

    // Top sınırdan sekme
    if (ball.x < 10 || ball.x > 590) ball.dx *= -1;
    if (ball.y < 10 || ball.y > 390) ball.dy *= -1;
    ball.x = Math.max(10, Math.min(590, ball.x));
    ball.y = Math.max(10, Math.min(390, ball.y));

    // Durum gönder
    const gameState = {
      type: 'gameState',
      players: Array.from(room.players.values()).map(p => ({
        nickname: p.nickname,
        x: p.x,
        y: p.y,
      })),
      ball: {
        x: ball.x,
        y: ball.y,
      }
    };

    for (let player of room.players.values()) {
      player.ws.send(JSON.stringify(gameState));
    }
  }, 1000 / FPS);
}

function generateId() {
  return Math.random().toString(36).substring(2, 8);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`HackBall server running on ${PORT}`));
