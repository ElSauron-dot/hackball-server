const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;
const wss = new WebSocket.Server({ port: PORT });

const FIELD_WIDTH = 1000;
const FIELD_HEIGHT = 600;
const PLAYER_SIZE = 40;
const BALL_SIZE = 30;

const MATCH_DURATION_MS = 5 * 60 * 1000; // 5 dakika

class Player {
  constructor(nickname, ws, team) {
    this.nickname = nickname;
    this.ws = ws;
    this.x = 100;
    this.y = 100;
    this.room = null;
    this.team = team;
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
    this.ball.x += this.ball.vx;
    this.ball.y += this.ball.vy;

    // Kaleye göre gol kontrolü
    if (this.ball.x < 0) {
      if (this.ball.y + BALL_SIZE/2 > (FIELD_HEIGHT/2 - 75) && this.ball.y + BALL_SIZE/2 < (FIELD_HEIGHT/2 + 75)) {
        this.score.right++;
        this.resetBall();
        this.broadcast({ type: "score", score: this.score });
        return;
      } else {
        this.ball.x = 0;
        this.ball.vx *= -1;
      }
    }

    if (this.ball.x > FIELD_WIDTH - BALL_SIZE) {
      if (this.ball.y + BALL_SIZE/2 > (FIELD_HEIGHT/2 - 75) && this.ball.y + BALL_SIZE/2 < (FIELD_HEIGHT/2 + 75)) {
        this.score.left++;
        this.resetBall();
        this.broadcast({ type: "score", score: this.score });
        return;
      } else {
        this.ball.x = FIELD_WIDTH - BALL_SIZE;
        this.ball.vx *= -1;
      }
    }

    if (this.ball.y < 0) {
      this.ball.y = 0;
      this.ball.vy *= -1;
    }
    if (this.ball.y > FIELD_HEIGHT - BALL_SIZE) {
      this.ball.y = FIELD_HEIGHT - BALL_SIZE;
      this.ball.vy *= -1;
    }

    // Oyuncu-top çarpışması
    for (const player of this.players.values()) {
      if (this.checkCollision(player, this.ball)) {
        this.ball.vx = (this.ball.x - player.x) * 0.3;
        this.ball.vy = (this.ball.y - player.y) * 0.3;
      }
    }

    // Topun yavaşlaması
    this.ball.vx *= 0.95;
    this.ball.vy *= 0.95;

    // Maç bitti mi kontrol et
    if (Date.now() >= this.matchEndTime) {
      this.broadcast({ type: "matchEnd", score: this.score });
      this.players.clear();
      clearInterval(this.interval);
      return;
    }

    this.broadcast({
      type: "update",
      players: Array.from(this.players.values()).map(p => ({
        nickname: p.nickname,
        x: p.x,
        y: p.y,
        team: p.team
      })),
      ball: { x: this.ball.x, y: this.ball.y },
      score: this.score
    });
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
      const { nickname, roomId, team } = data;
      if (!nickname || !roomId || !team) {
        ws.send(JSON.stringify({ type: "error", message: "Nickname, oda ID ve takım gerekli" }));
        return;
      }

      let room = rooms.get(roomId);
      if (!room) {
        room = new Room(roomId);
        rooms.set(roomId, room);
        room.interval = setInterval(() => room.update(), 33); // 30 FPS güncelleme
      }

      for (const p of room.players.values()) {
        if (p.nickname === nickname) {
          ws.send(JSON.stringify({ type: "error", message: "Bu nick zaten kullanılıyor!" }));
          return;
        }
      }

      const player = new Player(nickname, ws, team);
      player.room = room;
      room.players.set(ws, player);
      currentPlayer = player;

      // Takıma göre başlangıç pozisyonu
      if (team === "red") {
        player.x = 50;
        player.y = FIELD_HEIGHT / 2 - PLAYER_SIZE / 2;
      } else {
        player.x = FIELD_WIDTH - 90;
        player.y = FIELD_HEIGHT / 2 - PLAYER_SIZE / 2;
      }

      room.broadcast({
        type: "players",
        players: Array.from(room.players.values()).map(p => ({
          nickname: p.nickname,
          x: p.x,
          y: p.y,
          team: p.team
        }))
      });
    }

    if (data.type === "move" && currentPlayer) {
      if (typeof data.x === "number" && typeof data.y === "number") {
        // Sahanın dışına çıkmayı engelle
        currentPlayer.x = Math.min(Math.max(0, data.x), FIELD_WIDTH - PLAYER_SIZE);
        currentPlayer.y = Math.min(Math.max(0, data.y), FIELD_HEIGHT - PLAYER_SIZE);

        // Şut varsa topa ekstra hız ver
        if (data.action === "kick") {
          const dx = currentPlayer.x + PLAYER_SIZE/2 - (currentPlayer.room.ball.x + BALL_SIZE/2);
          const dy = currentPlayer.y + PLAYER_SIZE/2 - (currentPlayer.room.ball.y + BALL_SIZE/2);
          currentPlayer.room.ball.vx -= dx * 0.5;
          currentPlayer.room.ball.vy -= dy * 0.5;
        }
      }
    }
  });

  ws.on("close", () => {
    if (currentPlayer && currentPlayer.room) {
      currentPlayer.room.players.delete(ws);
      currentPlayer.room.broadcast({
        type: "players",
        players: Array.from(currentPlayer.room.players.values()).map(p => ({
          nickname: p.nickname,
          x: p.x,
          y: p.y,
          team: p.team
        }))
      });
    }
  });
});

console.log(`✅ HackBall WebSocket server ${PORT} portunda çalışıyor`);
