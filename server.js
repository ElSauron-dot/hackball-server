const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const cors = require("cors");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

app.use(cors());

const parties = {}; // { partyId: { leaderId, players: [ {id, nick, color}], ... } }

io.on("connection", (socket) => {
  console.log(`Kullanıcı bağlandı: ${socket.id}`);

  socket.on("createParty", ({ nick }) => {
    const partyId = uuidv4().slice(0, 6);
    parties[partyId] = {
      leaderId: socket.id,
      players: [],
    };

    const player = {
      id: socket.id,
      nick,
      color: "red",
    };

    parties[partyId].players.push(player);
    socket.join(partyId);
    io.to(socket.id).emit("partyCreated", partyId);
    io.to(partyId).emit("updatePlayerList", parties[partyId].players);
  });

  socket.on("joinParty", ({ nick, partyId }) => {
    const party = parties[partyId];
    if (!party) return;

    const color = party.players.filter(p => p.color === "red").length <= party.players.filter(p => p.color === "blue").length ? "red" : "blue";
    const player = {
      id: socket.id,
      nick,
      color,
    };

    party.players.push(player);
    socket.join(partyId);
    io.to(socket.id).emit("joinedParty", { partyId });
    io.to(partyId).emit("updatePlayerList", party.players);
  });

  socket.on("changeTeam", ({ id, partyId }) => {
    const party = parties[partyId];
    if (!party || socket.id !== party.leaderId) return;

    const player = party.players.find(p => p.id === id);
    if (player) {
      player.color = player.color === "red" ? "blue" : "red";
      io.to(partyId).emit("updatePlayerList", party.players);
    }
  });

  socket.on("kickPlayer", ({ id, partyId }) => {
    const party = parties[partyId];
    if (!party || socket.id !== party.leaderId) return;

    party.players = party.players.filter(p => p.id !== id);
    io.to(id).emit("kicked");
    io.to(partyId).emit("updatePlayerList", party.players);
  });

  socket.on("makeLeader", ({ id, partyId }) => {
    const party = parties[partyId];
    if (!party || socket.id !== party.leaderId) return;

    party.leaderId = id;
    io.to(partyId).emit("updatePlayerList", party.players);
  });

  socket.on("disconnect", () => {
    console.log(`Kullanıcı ayrıldı: ${socket.id}`);
    for (const [partyId, party] of Object.entries(parties)) {
      const index = party.players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        party.players.splice(index, 1);

        if (party.leaderId === socket.id && party.players.length > 0) {
          party.leaderId = party.players[0].id; // Yeni lider belirle
        }

        if (party.players.length === 0) {
          delete parties[partyId];
        } else {
          io.to(partyId).emit("updatePlayerList", party.players);
        }
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Sunucu ${PORT} portunda çalışıyor.`);
});
