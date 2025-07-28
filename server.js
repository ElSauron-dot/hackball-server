const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = process.env.PORT || 3000;

app.use(express.static('.'));

let games = {};

function randomId() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function createPlayer(name, leader = false, team = 'red') {
  return {
    name,
    x: Math.random() * 800 + 80,
    y: Math.random() * 400 + 70,
    color: team === 'red' ? 'crimson' : 'dodgerblue',
    team,
    vx: 0, vy: 0,
    leader
  };
}

io.on('connection', socket => {
  let gameId, player;

  socket.on('create', name => {
    gameId = randomId();
    player = createPlayer(name, true, 'red');
    games[gameId] = {
      players: { [socket.id]: player },
      ball: { x: 480, y: 270, vx: 0, vy: 0 }
    };
    socket.join(gameId);
    socket.emit('init', { id: socket.id, teamLeader: true });
  });

  socket.on('join', ({ nick, id }) => {
    const game = games[id];
    if (!game) return;
    gameId = id;
    player = createPlayer(nick, false, 'blue');
    game.players[socket.id] = player;
    socket.join(gameId);
    socket.emit('init', { id: socket.id, teamLeader: false });
  });

  socket.on('input', keys => {
    if (!player) return;
    player.vx = player.vy = 0;
    if (keys['KeyW'] || keys['ArrowUp']) player.vy = -2;
    if (keys['KeyS'] || keys['ArrowDown']) player.vy = 2;
    if (keys['KeyA'] || keys['ArrowLeft']) player.vx = -2;
    if (keys['KeyD'] || keys['ArrowRight']) player.vx = 2;

    // Topla temas (şut)
    const game = games[gameId];
    if (!game) return;
    const ball = game.ball;
    const dx = ball.x - player.x;
    const dy = ball.y - player.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if ((keys['Space'] || keys['Numpad0']) && dist < 25) {
      ball.vx += dx / dist * 3;
      ball.vy += dy / dist * 3;
    }
  });

  socket.on('changeTeam', ({ id, team }) => {
    const g = games[gameId];
    if (g?.players[id]) {
      g.players[id].team = team;
      g.players[id].color = team === 'red' ? 'crimson' : 'dodgerblue';
    }
  });

  socket.on('kick', id => {
    const g = games[gameId];
    if (g?.players[id]) {
      io.to(id).disconnectSockets();
      delete g.players[id];
    }
  });

  socket.on('disconnect', () => {
    const g = games[gameId];
    if (g?.players[socket.id]) delete g.players[socket.id];
  });
});

setInterval(() => {
  for (const id in games) {
    const g = games[id];
    // Top fiziği
    g.ball.x += g.ball.vx;
    g.ball.y += g.ball.vy;
    g.ball.vx *= 0.98;
    g.ball.vy *= 0.98;

    // Sınır çarpması
    if (g.ball.x < 10 || g.ball.x > 950) g.ball.vx *= -1;
    if (g.ball.y < 10 || g.ball.y > 530) g.ball.vy *= -1;

    io.to(id).emit('state', {
      players: g.players,
      ball: g.ball
    });
  }
}, 20);

server.listen(PORT, () => console.log('Server running on port', PORT));
