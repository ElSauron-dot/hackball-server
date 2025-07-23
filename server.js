const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

const FIELD_WIDTH = 1000;
const FIELD_HEIGHT = 600;
const PLAYER_SIZE = 40;
const BALL_SIZE = 30;

const MATCH_DURATION_MS = 5 * 60 * 1000; // 5 dakika

class Player {
  constructor(nickname, ws) {
    this.nickname = nickname;
    this.ws = ws;
    this.x = 100;
    this.y = 100;
    this.room = null;
  }
}

class Room {
  constructor(id) {
    this.id = id;
    this.players = new Map();
    this.ball = { x: 485, y: 285, vx: 0, vy: 0 };
    this.score = { left: 0, right: 0 };
    this.matchEndTime = Date.now() + MATCH_DURATION_MS;
  }

  broadcast(data) {
    const msg = JSON.stringify(data);
    for (const player of this.players.values()) {
      if (player.ws.readyState === WebSocket.OPEN) {
        player.ws.send(msg);
      }
    }
  }

  update() {
    // Topu hareket ettir
    this.ball.x += this.ball.vx;
    this.ball.y += this.ball.vy;

    // Top sınırlar
    if (this.ball.x < 0) {
      // Gol solda
      this.score.right++;
      this.resetBall();
      this.broadcast({ type: "score", score: this.score });
      return;
    }
    if (this.ball.x > FIELD_WIDTH - BALL_SIZE) {
      // Gol sağda
      this.score.left++;
      this.resetBall();
      this.broadcast({ type: "score", score: this.score });
      return;
    }
    if (this.ball.y < 0) {
      this.ball.y = 0;
      this.ball.vy *= -1;
    }
    if (this.ball.y > FIELD_HEIGHT - BALL_SIZE) {
      this.ball.y = FIELD_HEIGHT - BALL_SIZE;
      this.ball.vy *= -1;
    }

    // Oyunculara çarpma
    for (const player of this.players.values()) {
      if (this.checkCollision(player, this.ball)) {
        // Topa vur
        this.ball.vx = (this.ball.x - player.x) * 0.3;
        this.ball.vy = (this.ball.y - player.y) * 0.3;
      }
    }

    // Top hızını yavaşlat
    this.ball.vx *= 0.95;
    this.ball.vy *= 0.95;

    // Maç bitiş kontrolü
    if (Date.now() >= this.matchEndTime) {
      this.broadcast({ type: "matchEnd", score: this.score });
      this.players.clear(); // Odayı temizle
      clearInterval(this.interval);
    } else {
      // Güncelleme bilgisini yolla
      this.broadcast({
        type: "update",
        players: Array.from(this.players.values()).map(p => ({
          nickname: p.nickname,
          x: p.x,
          y: p.y
        })),
        ball: { x: this.ball.x, y: this.ball.y },
        score: this.score
      });
    }
  }

  resetBall() {
    this.ball.x = (FIELD_WIDTH - BALL_SIZE) / 2;
    this.ball.y = (FIELD_HEIGHT - BALL_SIZE) / 2;
    this.ball.vx = 0;
    this.ball.vy = 0;
  }

  checkCollision(player, ball) {
    const px = player.x + PLAYER_SIZE / 2;
    const py = player.y + PLAYER_SIZE / 2;
    const bx = ball.x + BALL_SIZE / 2;
    const by = ball.y + BALL_SIZE / 2;
    const distSq = (px - bx) ** 2 + (py - by) ** 2;
    const radiusSum = PLAYER_SIZE / 2 + BALL_SIZE / 2;
    return distSq < radiusSum * radiusSum;
  }
}

const rooms = new Map();

wss.on("connection", (ws) => {
  let currentPlayer = null;

  ws.on("message", (message) => {
    let data;
    try {
      data = JSON.parse(message);
    } catch {
      return;
    }

    if (data.type === "join") {
      const { nickname, roomId } = data;
      if (!nickname || !roomId) {
        ws.send(JSON.stringify({ type: "error", message: "Nickname ve oda ID gerekli" }));
        return;
      }

      let room = rooms.get(roomId);
      if (!room) {
        room = new Room(roomId);
        rooms.set(roomId, room);
        // Maç güncellemeleri için interval başlat
        room.interval = setInterval(() => room.update(), 100);
      }

      // Aynı oda, aynı nick kontrolü
      for (const p of room.players.values()) {
        if (p.nickname === nickname) {
          ws.send(JSON.stringify({ type: "error", message: "Bu nick zaten kullanılıyor!" }));
          return;
        }
      }

      const player = new Player(nickname, ws);
      player.room = room;
      room.players.set(ws, player);
      currentPlayer = player;

      // Başlangıç pozisyonu dağıt (sağ-sol takımı için basit ayırma)
      if (room.players.size % 2 === 0) {
        player.x = 100;
        player.y = 100 + Math.random() * (FIELD_HEIGHT - PLAYER_SIZE);
      } else {
        player.x = FIELD_WIDTH - 140;
        player.y = 100 + Math.random() * (FIELD_HEIGHT - PLAYER_SIZE);
      }

      // Oyuncuları gönder
      room.broadcast({
        type: "players",
        players: Array.from(room.players.values()).map(p => ({
          nickname: p.nickname,
          x: p.x,
          y: p.y
        }))
      });
    }

    if (data.type === "move" && currentPlayer && currentPlayer.room) {
      const room = currentPlayer.room;
      currentPlayer.x = Math.min(Math.max(0, data.x), FIELD_WIDTH - PLAYER_SIZE);
      currentPlayer.y = Math.min(Math.max(0, data.y), FIELD_HEIGHT - PLAYER_SIZE);

      if (data.action === "kick") {
        // Eğer topa yakınsa, topa vur
        const distX = currentPlayer.x + PLAYER_SIZE / 2 - (room.ball.x + BALL_SIZE / 2);
        const distY = currentPlayer.y + PLAYER_SIZE / 2 - (room.ball.y + BALL_SIZE / 2);
        const dist = Math.sqrt(distX * distX + distY * distY);
        if (dist < 80) {
          // Topa kuvvet uygula
          room.ball.vx = distX * 0.7;
          room.ball.vy = distY * 0.7;
        }
      }
    }
  });

  ws.on("close", () => {
    if (currentPlayer && currentPlayer.room) {
      currentPlayer.room.players.delete(ws);
    }
  });
});

console.log(`✅ HackBall WebSocket server ${PORT} portunda çalışıyor`);
