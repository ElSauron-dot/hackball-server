const express = require("express");
const app = express();
const http = require("http").Server(app);
const cors = require("cors");
const { Server } = require("socket.io");

app.use(cors());
app.use(express.static("public"));

const io = new Server(http, {
  cors: {
    origin: "*"
  }
});

const PORT = process.env.PORT || 3000;

let rooms = {};
let ball = {
  x: 400,
  y: 300,
  vx: 0,
  vy: 0,
  radius: 10
};

io.on("connection", (socket) => {
  console.log("Bir oyuncu bağlandı:", socket.id);

  socket.on("createRoom", ({ nickname, team }) => {
    const roomId = Math.random().toString(36).substr(2, 6);
    rooms[roomId] = {
      host: socket.id,
      players: {},
      timer: 360,
      score: { red: 0, blue: 0 },
      started: false
    };
    socket.join(roomId);
    rooms[roomId].players[socket.id] = {
      playerId: socket.id,
      nickname,
      team,
      x: team === "red" ? 200 : 600,
      y: 300,
      vx: 0,
      vy: 0
    };
    socket.emit("roomCreated", roomId);
  });

  socket.on("joinRoom", ({ roomId, nickname, team }) => {
    const room = rooms[roomId];
    if (!room) {
      socket.emit("errorMsg", "Geçersiz Parti ID");
      return;
    }
    socket.join(roomId);
    room.players[socket.id] = {
      playerId: socket.id,
      nickname,
      team,
      x: team === "red" ? 200 : 600,
      y: 300,
      vx: 0,
      vy: 0
    };
    socket.emit("roomJoined", roomId);
  });

  socket.on("startGame", (roomId) => {
    if (rooms[roomId]) {
      rooms[roomId].started = true;
      rooms[roomId].timer = 360;
    }
  });

  socket.on("input", ({ roomId, input }) => {
    const player = rooms[roomId]?.players[socket.id];
    if (player) {
      const speed = 3.5;
      player.vx = 0;
      player.vy = 0;
      if (input.left) player.vx -= speed;
      if (input.right) player.vx += speed;
      if (input.up) player.vy -= speed;
      if (input.down) player.vy += speed;

      player.x += player.vx;
      player.y += player.vy;

      const dx = player.x - ball.x;
      const dy = player.y - ball.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < ball.radius + 15) {
        if (input.kick) {
          ball.vx = dx * 0.2;
          ball.vy = dy * 0.2;
        } else {
          ball.vx += dx * 0.005;
          ball.vy += dy * 0.005;
        }
      }
    }
  });

  socket.on("chat", ({ roomId, msg, nickname }) => {
    io.to(roomId).emit("chat", { nickname, msg });
  });

  socket.on("disconnect", () => {
    for (const roomId in rooms) {
      delete rooms[roomId].players[socket.id];
      if (Object.keys(rooms[roomId].players).length === 0) {
        delete rooms[roomId];
      }
    }
  });
});

setInterval(() => {
  for (const roomId in rooms) {
    const room = rooms[roomId];
    if (room.started) {
      ball.x += ball.vx;
      ball.y += ball.vy;

      ball.vx *= 0.98;
      ball.vy *= 0.98;

      if (ball.x < 0 || ball.x > 800) ball.vx *= -1;
      if (ball.y < 0 || ball.y > 600) ball.vy *= -1;

      room.timer--;
      if (room.timer <= 0) {
        room.started = false;
        room.timer = 360;
        ball = { x: 400, y: 300, vx: 0, vy: 0, radius: 10 };
        for (let pid in room.players) {
          const p = room.players[pid];
          p.x = p.team === "red" ? 200 : 600;
          p.y = 300;
        }
      }

      io.to(roomId).emit("gameState", {
        players: Object.values(room.players),
        ball,
        score: room.score,
        timeLeft: room.timer
      });
    }
  }
}, 1000 / 60);

http.listen(PORT, () => {
  console.log(`HackBall sunucusu ${PORT} portunda çalışıyor`);
});
