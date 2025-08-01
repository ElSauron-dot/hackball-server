const WebSocket = require('ws');
const http = require('http');

const server = http.createServer();
const wss = new WebSocket.Server({ server });

const rooms = {};

function createPlayer(nickname, team) {
  const startX = team === 'red' ? 100 : 500;
  const startY = Math.random() * 300 + 50;
  return { nickname, team, x: startX, y: startY, pressing: {}, speed: 2.5 };
}

function createBall() {
  return { x: 300, y: 200, dx: 0, dy: 0, radius: 10, friction: 0.98 };
}

wss.on('connection', ws => {
  let roomId = '', playerId = '';
  ws.on('message', msg => {
    const data = JSON.parse(msg);
    if (data.type === 'join') {
      const { nickname, roomId: rid, team } = data;
      roomId = rid;
      if (!rooms[roomId]) {
        rooms[roomId] = { players: new Map(), ball: createBall(), interval: null };
        startGameLoop(roomId);
      }
      if (!['red','blue'].includes(team)) {
        return ws.send(JSON.stringify({ type: 'error', message: 'Geçersiz takım seçimi.' }));
      }
      if ([...rooms[roomId].players.values()].some(p => p.team === team)) {
        return ws.send(JSON.stringify({ type: 'error', message: 'Bu takım zaten dolu.' }));
      }
      playerId = Math.random().toString(36).substring(2, 8);
      rooms[roomId].players.set(playerId, { ws, playerId, ...createPlayer(nickname, team) });
    }
    else if (data.type === 'move') {
      const room = rooms[roomId];
      const player = room?.players.get(playerId);
      if (player) {
        player.pressing[data.dir] = true;
        setTimeout(() => { player.pressing[data.dir] = false; }, 100);
      }
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

    for (let player of room.players.values()) {
      let dx = 0, dy = 0;
      if (player.pressing.up) dy -= 1;
      if (player.pressing.down) dy += 1;
      if (player.pressing.left) dx -= 1;
      if (player.pressing.right) dx += 1;
      const len = Math.hypot(dx, dy);
      if (len > 0) {
        dx /= len; dy /= len;
        player.x += dx * player.speed;
        player.y += dy * player.speed;
        const dist = Math.hypot(player.x - ball.x, player.y - ball.y);
        if (dist < 15 + ball.radius) {
          const angle = Math.atan2(ball.y - player.y, ball.x - player.x);
          ball.dx += Math.cos(angle) * 1.5;
          ball.dy += Math.sin(angle) * 1.5;
        }
      }
      player.x = Math.max(15, Math.min(585, player.x));
      player.y = Math.max(15, Math.min(385, player.y));
    }

    ball.x += ball.dx; ball.y += ball.dy;
    ball.dx *= ball.friction; ball.dy *= ball.friction;
    if (ball.x < 10 || ball.x > 590) ball.dx *= -1;
    if (ball.y < 10 || ball.y > 390) ball.dy *= -1;
    ball.x = Math.max(10, Math.min(590, ball.x));
    ball.y = Math.max(10, Math.min(390, ball.y));

    const state = { type: 'gameState', players: Array.from(room.players.values()).map(p => ({
      playerId: p.playerId, nickname: p.nickname, team: p.team, x: p.x, y: p.y
    })), ball: { x: ball.x, y: ball.y } };

    room.players.forEach(p => p.ws.send(JSON.stringify(state)));
  }, 1000 / FPS);
}

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Server başladı: ${port}`));
