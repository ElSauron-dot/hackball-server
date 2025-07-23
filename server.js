const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

const PORT = process.env.PORT || 3000;

let games = {}; // partyId -> game data

io.on('connection', (socket) => {
  let player = null;
  let partyId = null;

  socket.on('join', ({ nickname, team }) => {
    partyId = Object.keys(games).find(id => games[id].players.length < 6) || uuidv4();

    if (!games[partyId]) {
      games[partyId] = {
        players: [],
        ball: { x: 500, y: 300, vx: 0, vy: 0 },
        host: socket.id,
        startTime: Date.now()
      };
    }

    player = {
      id: socket.id,
      nickname,
      x: Math.random() * 900 + 50,
      y: Math.random() * 500 + 50,
      team,
      keys: {},
      isHost: socket.id === games[partyId].host
    };

    games[partyId].players.push(player);

    socket.join(partyId);

    socket.emit('teamSelect');
  });

  socket.on('key', ({ key, state }) => {
    if (player) {
      player.keys[key] = state;
    }
  });

  socket.on('setTeam', ({ id, team }) => {
    const game = games[partyId];
    if (game && game.host === socket.id) {
      const p = game.players.find(p => p.id === id);
      if (p) p.team = team;
    }
  });

  socket.on('kick', (id) => {
    const game = games[partyId];
    if (game && game.host === socket.id) {
      const index = game.players.findIndex(p => p.id === id);
      if (index !== -1) {
        const target = game.players.splice(index, 1)[0];
        io.to(target.id).disconnectSockets(true);
      }
    }
  });

  socket.on('disconnect', () => {
    const game = games[partyId];
    if (game) {
      game.players = game.players.filter(p => p.id !== socket.id);
      if (game.players.length === 0) {
        delete games[partyId];
      }
    }
  });
});

setInterval(() => {
  for (const [id, game] of Object.entries(games)) {
    for (const p of game.players) {
      const speed = 5;
      if (p.keys['ArrowUp']) p.y -= speed;
      if (p.keys['ArrowDown']) p.y += speed;
      if (p.keys['ArrowLeft']) p.x -= speed;
      if (p.keys['ArrowRight']) p.x += speed;

      // Top ile çarpışma ve sürükleme
      const dx = game.ball.x - p.x;
      const dy = game.ball.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 25) {
        const force = 0.5;
        game.ball.vx += -dx * force / 25;
        game.ball.vy += -dy * force / 25;
      }
    }

    // Top fiziği
    game.ball.x += game.ball.vx;
    game.ball.y += game.ball.vy;
    game.ball.vx *= 0.98;
    game.ball.vy *= 0.98;

    // Saha sınırları
    if (game.ball.x < 0 || game.ball.x > 1000) game.ball.vx *= -1;
    if (game.ball.y < 0 || game.ball.y > 600) game.ball.vy *= -1;

    // Maç süresi (5 dk)
    if (Date.now() - game.startTime > 5 * 60 * 1000) {
      io.to(id).emit('matchEnd');
      delete games[id];
      continue;
    }

    io.to(id).emit('state', {
      players: Object.fromEntries(game.players.map(p => [p.id, p])),
      ball: game.ball,
      isHost: game.host === game.players.find(p => p.id === p.id)?.id,
      partyId: id
    });
  }
}, 1000 / 60);

server.listen(PORT, () => {
  console.log(`✅ HackBall sunucusu ${PORT} portunda çalışıyor`);
});
