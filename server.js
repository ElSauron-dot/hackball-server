const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static(__dirname));

let parties = {};

io.on("connection", (socket) => {
  socket.on("join", ({ nickname, partyId, team }) => {
    if (!parties[partyId]) {
      parties[partyId] = {
        players: {},
        ball: { x: 450, y: 250, vx: 0, vy: 0 },
        host: socket.id,
      };
    }

    parties[partyId].players[socket.id] = {
      id: socket.id,
      nickname,
      x: 100,
      y: 100,
      team,
    };

    socket.join(partyId);
    socket.emit("init", {
      id: socket.id,
      players: parties[partyId].players,
      ball: parties[partyId].ball,
      isHost: parties[partyId].host === socket.id,
    });

    io.to(partyId).emit("state", {
      players: parties[partyId].players,
      ball: parties[partyId].ball,
    });

    io.to(partyId).emit("partyId", partyId);
    io.to(partyId).emit("updatePlayers", parties[partyId].players);
  });

  socket.on("move", ({ x, y }) => {
    for (const id in parties) {
      if (parties[id].players[socket.id]) {
        parties[id].players[socket.id].x = x;
        parties[id].players[socket.id].y = y;
        io.to(id).emit("state", {
          players: parties[id].players,
          ball: parties[id].ball,
        });
      }
    }
  });

  socket.on("kick", ({ vx, vy }) => {
    for (const id in parties) {
      if (parties[id].players[socket.id]) {
        parties[id].ball.vx = vx;
        parties[id].ball.vy = vy;
      }
    }
  });

  socket.on("setTeam", ({ id, team }) => {
    for (const pid in parties) {
      if (parties[pid].players[socket.id] && parties[pid].host === socket.id) {
        if (parties[pid].players[id]) {
          parties[pid].players[id].team = team;
          io.to(pid).emit("updatePlayers", parties[pid].players);
        }
      }
    }
  });

  socket.on("kick", (id) => {
    for (const pid in parties) {
      if (parties[pid].host === socket.id && parties[pid].players[id]) {
        io.to(id).emit("disconnect");
        delete parties[pid].players[id];
        io.to(pid).emit("updatePlayers", parties[pid].players);
      }
    }
  });

  socket.on("disconnect", () => {
    for (const id in parties) {
      if (parties[id].players[socket.id]) {
        delete parties[id].players[socket.id];
        io.to(id).emit("updatePlayers", parties[id].players);
      }
    }
  });
});

setInterval(() => {
  for (const id in parties) {
    const ball = parties[id].ball;
    ball.x += ball.vx;
    ball.y += ball.vy;
    ball.vx *= 0.98;
    ball.vy *= 0.98;
    if (ball.x < 10 || ball.x > 890) ball.vx *= -1;
    if (ball.y < 10 || ball.y > 490) ball.vy *= -1;

    io.to(id).emit("state", {
      players: parties[id].players,
      ball: parties[id].ball,
    });
  }
}, 1000 / 50);

http.listen(3000, () => {
  console.log("HackBall sunucusu 3000 portunda çalışıyor");
});
