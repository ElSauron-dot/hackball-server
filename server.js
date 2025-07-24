const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(__dirname));

let parties = {};

io.on("connection", (socket) => {
  socket.on("createParty", ({ nickname, team }) => {
    const partyId = Math.random().toString(36).substr(2, 6);
    parties[partyId] = {
      leaderId: socket.id,
      players: {}
    };
    const player = { id: socket.id, x: 500, y: 300, team, nickname, partyId };
    parties[partyId].players[socket.id] = player;
    socket.join(partyId);
    socket.emit("startGame", { player, players: parties[partyId].players });
  });

  socket.on("joinParty", ({ nickname, team, partyId }) => {
    if (!parties[partyId]) return;
    const player = { id: socket.id, x: 500, y: 300, team, nickname, partyId };
    parties[partyId].players[socket.id] = player;
    socket.join(partyId);
    io.to(partyId).emit("updateState", {
      players: parties[partyId].players,
      ball: { x: 500, y: 300, vx: 0, vy: 0 }
    });
    socket.emit("startGame", { player, players: parties[partyId].players });
    io.to(partyId).emit("updateLeader", parties[partyId].leaderId);
  });

  socket.on("playerMove", ({ x, y }) => {
    for (let partyId in parties) {
      const party = parties[partyId];
      if (party.players[socket.id]) {
        party.players[socket.id].x = x;
        party.players[socket.id].y = y;
        io.to(partyId).emit("updateState", {
          players: party.players,
          ball: { x: 500, y: 300, vx: 0, vy: 0 }
        });
      }
    }
  });

  socket.on("changeTeam", ({ playerId, team }) => {
    for (let partyId in parties) {
      if (parties[partyId].leaderId === socket.id) {
        const p = parties[partyId].players[playerId];
        if (p) p.team = team;
        io.to(partyId).emit("updateState", {
          players: parties[partyId].players,
          ball: { x: 500, y: 300, vx: 0, vy: 0 }
        });
      }
    }
  });

  socket.on("kickPlayer", (playerId) => {
    for (let partyId in parties) {
      if (parties[partyId].leaderId === socket.id) {
        delete parties[partyId].players[playerId];
        io.to(partyId).emit("updateState", {
          players: parties[partyId].players,
          ball: { x: 500, y: 300, vx: 0, vy: 0 }
        });
      }
    }
  });

  socket.on("disconnect", () => {
    for (let partyId in parties) {
      const party = parties[partyId];
      if (party.players[socket.id]) {
        delete party.players[socket.id];
        if (party.leaderId === socket.id) {
          const remaining = Object.keys(party.players);
          party.leaderId = remaining[0] || null;
          if (party.leaderId)
            io.to(partyId).emit("updateLeader", party.leaderId);
        }
        io.to(partyId).emit("updateState", {
          players: party.players,
          ball: { x: 500, y: 300, vx: 0, vy: 0 }
        });
      }
    }
  });
});

server.listen(3000, () => {
  console.log("Server ready on http://localhost:3000");
});
