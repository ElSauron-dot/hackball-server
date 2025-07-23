const http = require('http');
const WebSocket = require('ws');

const PORT = process.env.PORT || 3000;

const FIELD_WIDTH = 1000;
const FIELD_HEIGHT = 600;
const GOAL_WIDTH = 100;
const GOAL_HEIGHT = 150;
const MATCH_DURATION_MS = 5 * 60 * 1000; // 5 dakika

const server = http.createServer();
const wss = new WebSocket.Server({ server });

let rooms = {};

function createRoom(roomId) {
  rooms[roomId] = {
    players: new Map(),
    ball: { x: FIELD_WIDTH / 2 - 15, y: FIELD_HEIGHT / 2 - 15, vx: 0, vy: 0 },
    score: { left: 0, right: 0 },
    startTime: Date.now(),
    ended: false,
  };
  rooms[roomId].roomId = roomId;
}

function broadcast(roomId, message) {
  if (!rooms[roomId]) return;
  rooms[roomId].players.forEach(({ ws }) => {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message));
    }
  });
}

function resetBall(room) {
  room.ball.x = FIELD_WIDTH / 2 - 15;
  room.ball.y = FIELD_HEIGHT / 2 - 15;
  room.ball.vx = 0;
  room.ball.vy = 0;
}

function updateBall(room) {
  if (room.ended) return;

  let ball = room.ball;
  ball.x += ball.vx;
  ball.y += ball.vy;

  // Sınırlar ve kaleler
  if (ball.y <= 0) {
    ball.y = 0;
    ball.vy = -ball.vy * 0.7;
  }
  if (ball.y + 30 >= FIELD_HEIGHT) {
    ball.y = FIELD_HEIGHT - 30;
    ball.vy = -ball.vy * 0.7;
  }

  // Sol kale ve gol kontrolü
  if (ball.x <= 0) {
    if (ball.y + 30 > (FIELD_HEIGHT / 2 - GOAL_HEIGHT / 2) && ball.y < (FIELD_HEIGHT / 2 + GOAL_HEIGHT / 2)) {
      room.score.right++;
      resetBall(room);
      broadcast(room.roomId, { type: "score", score: room.score });
      broadcast(room.roomId, { type: "goal", side: "right" });
    } else {
      ball.x = 0;
      ball.vx = -ball.vx * 0.7;
    }
  }

  // Sağ kale ve gol kontrolü
  if (ball.x + 30 >= FIELD_WIDTH) {
    if (ball.y + 30 > (FIELD_HEIGHT / 2 - GOAL_HEIGHT / 2) && ball.y < (FIELD_HEIGHT / 2 + GOAL_HEIGHT / 2)) {
      room.score.left++;
      resetBall(room);
      broadcast(room.roomId, { type: "score", score: room.score });
      broadcast(room.roomId, { type: "goal", side: "left" });
    } else {
      ball.x = FIELD_WIDTH - 30;
      ball.vx = -ball.vx * 0.7;
    }
  }

  // Hareket sürtünmesi
  ball.vx *= 0.95;
  ball.vy *= 0.95;

  broadcast(room.roomId, { type: "ball", x: ball.x, y: ball.y });
}

function checkMatchEnd(room) {
  if (room.ended) return;

  if (Date.now() - room.startTime >= MATCH_DURATION_MS) {
    room.ended = true;
    broadcast(room.roomId, { type: "matchEnd", score: room.score });
  }
}

wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });

  ws.on('message', (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    if (data.type === "join") {
      const { roomId, nickname } = data;
      if (!rooms[roomId]) createRoom(roomId);

      if (rooms[roomId].ended) {
        ws.send(JSON.stringify({ type: "matchEnded", message: "Maç sona erdi!" }));
        return;
      }

      rooms[roomId].players.set(nickname, { x: 100, y: 100, ws });
      ws.nickname = nickname;
      ws.roomId = roomId;

      // Oyuncu listesi gönder
      broadcast(roomId, { type: "players", players: Array.from(rooms[roomId].players.keys()) });
      // Skor ve top gönder
      broadcast(roomId, { type: "score", score: rooms[roomId].score });
      broadcast(roomId, { type: "ball", x: rooms[roomId].ball.x, y: rooms[roomId].ball.y });
    } 
    else if (data.type === "move") {
      const room = rooms[ws.roomId];
      if (!room || room.ended) return;

      const player = room.players.get(ws.nickname);
      if (!player) return;

      // Oyuncu pozisyonunu güncelle
      player.x = Math.min(Math.max(0, data.x), FIELD_WIDTH - 40);
      player.y = Math.min(Math.max(0, data.y), FIELD_HEIGHT - 40);

      // Eğer şut varsa topa vur
      if (data.action === "kick") {
        const dx = room.ball.x + 15 - (player.x + 20);
        const dy = room.ball.y + 15 - (player.y + 20);
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 60) { // yakınsa topa vur
          const power = 10;
          room.ball.vx = (dx / dist) * power;
          room.ball.vy = (dy / dist) * power;
        }
      }

      // Güncellemeleri tüm oyunculara yolla
      broadcast(room.roomId, { type: "move", nickname: ws.nickname, x: player.x, y: player.y });
    }
  });

  ws.on('close', () => {
    const room = rooms[ws.roomId];
    if (!room) return;

    room.players.delete(ws.nickname);
    broadcast(ws.roomId, { type: "players", players: Array.from(room.players.keys()) });
  });
});

// Topu ve maç bitişini düzenli kontrol et
setInterval(() => {
  Object.values(rooms).forEach(room => {
    if (!room.ended) {
      updateBall(room);
      checkMatchEnd(room);
    }
  });
}, 40); // 25 FPS

// WebSocket ping/pong bağlantı kontrolü
setInterval(() => {
  wss.clients.forEach(ws => {
    if (!ws.isAlive) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);

server.listen(PORT, () => {
  console.log(`✅ HackBall WebSocket server ${PORT} portunda çalışıyor`);
});
