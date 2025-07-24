const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname + "/"));

let parties = {};

function createPartyId() {
  return Math.random().toString(36).substr(2, 6).toUpperCase();
}

function getInitialPlayer(id, name, team) {
  return {
    id,
    name,
    x: Math.random() * 600 + 100,
    y: Math.random() * 300 + 100,
    team,
    vx: 0,
    vy: 0,
    isLeader: false,
  };
}

io.on("connection", (socket) => {
  console.log("Yeni bağlantı: " + socket.id);

  socket.on("createParty", ({ name, team }) => {
    const partyId = createPartyId();
    parties[partyId] = {
      id: partyId,
      players: {},
      ball: { x: 400, y: 300, vx: 0, vy: 0 },
      leader: socket.id,
      startTime: Date.now()
    };

    const player = getInitialPlayer(socket.id, name, team);
    player.isLeader = true;

    parties[partyId].players[socket.id] = player;
    socket.join(partyId);
    socket.partyId = partyId;

    io.to(partyId).emit("partyData", parties[partyId]);
  });

  socket.on("joinParty", ({ name, team, partyId }) => {
    if (!parties[partyId]) {
      socket.emit("errorMsg", "Parti bulunamadı!");
      return;
    }

    const player = getInitialPlayer(socket.id, name, team);
    parties[partyId].players[socket.id] = player;
    socket.join(partyId);
    socket.partyId = partyId;

    io.to(partyId).emit("partyData", parties[partyId]);
  });

  socket.on("move", ({ x, y }) => {
    const partyId = socket.partyId;
    if (parties[partyId] && parties[partyId].players[socket.id]) {
      const player = parties[partyId].players[socket.id];
      player.x = x;
      player.y = y;
    }
  });

  socket.on("kickBall", ({ forceX, forceY }) => {
    const partyId = socket.partyId;
    if (parties[partyId]) {
      parties[partyId].ball.vx += forceX;
      parties[partyId].ball.vy += forceY;
    }
  });

  socket.on("changeTeam", ({ playerId, team }) => {
    const partyId = socket.partyId;
    if (
      parties[partyId] &&
      socket.id === parties[partyId].leader &&
      parties[partyId].players[playerId]
    ) {
      parties[partyId].players[playerId].team = team;
      io.to(partyId).emit("partyData", parties[partyId]);
    }
  });

  socket.on("kickPlayer", ({ playerId }) => {
    const partyId = socket.partyId;
    if (
      parties[partyId] &&
      socket.id === parties[partyId].leader &&
      parties[partyId].players[playerId]
    ) {
      io.to(playerId).emit("kicked");
      delete parties[partyId].players[playerId];
      io.to(partyId).emit("partyData", parties[partyId]);
    }
  });

  socket.on("transferLeadership", ({ newLeaderId }) => {
    const partyId = socket.partyId;
    if (
      parties[partyId] &&
      socket.id === parties[partyId].leader &&
      parties[partyId].players[newLeaderId]
    ) {
      parties[partyId].leader = newLeaderId;
      for (let id in parties[partyId].players) {
        parties[partyId].players[id].isLeader = id === newLeaderId;
      }
      io.to(partyId).emit("partyData", parties[partyId]);
    }
  });

  socket.on("disconnect", () => {
    const partyId = socket.partyId;
    if (parties[partyId]) {
      delete parties[partyId].players[socket.id];
      if (Object.keys(parties[partyId].players).length === 0) {
        delete parties[partyId];
      } else {
        // lider çıktıysa yeni bir lider ata
        if (parties[partyId].leader === socket.id) {
          const newLeaderId = Object.keys(parties[partyId].players)[0];
          parties[partyId].leader = newLeaderId;
          parties[partyId].players[newLeaderId].isLeader = true;
        }
        io.to(partyId).emit("partyData", parties[partyId]);
      }
    }
  });
});

setInterval(() => {
  for (let partyId in parties) {
    const party = parties[partyId];
    const ball = party.ball;

    // Basit top fiziği
    ball.x += ball.vx;
    ball.y += ball.vy;
    ball.vx *= 0.98;
    ball.vy *= 0.98;

    // Duvar çarpması
    if (ball.x < 0 || ball.x > 800) ball.vx *= -1;
    if (ball.y < 0 || ball.y > 600) ball.vy *= -1;

    // Maç süresi kontrol
    const now = Date.now();
    if (now - party.startTime >= 6 * 60 * 1000) {
      io.to(partyId).emit("matchEnd");
      party.startTime = now;
    }

    io.to(partyId).emit("gameState", party);
  }
}, 1000 / 60);

server.listen(PORT, () => {
  console.log(`Server ${PORT} portunda çalışıyor...`);
});
