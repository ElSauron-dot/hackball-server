const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*"
  }
});

const parties = {};
const TICK_RATE = 50;
const PLAYER_SPEED = 3;
const BALL_SPEED = 5;
const BALL_RADIUS = 10;
const FIELD_WIDTH = 1000;
const FIELD_HEIGHT = 600;

io.on("connection", (socket) => {
  let currentParty = null;

  socket.on("createParty", (name) => {
    const partyID = uuidv4().slice(0, 5).toUpperCase();
    parties[partyID] = {
      leader: socket.id,
      players: {},
      ball: { x: FIELD_WIDTH / 2, y: FIELD_HEIGHT / 2, vx: 0, vy: 0 }
    };

    currentParty = partyID;
    parties[partyID].players[socket.id] = {
      id: socket.id,
      name,
      x: 100,
      y: 100,
      team: "red",
      input: {}
    };

    socket.join(partyID);
    io.to(socket.id).emit("init", {
      id: socket.id,
      allPlayers: parties[partyID].players,
      ballState: parties[partyID].ball,
      leader: socket.id,
      pid: partyID
    });
  });

  socket.on("joinParty", ({ name, id }) => {
    if (!parties[id]) return;
    currentParty = id;

    const team = Object.values(parties[id].players).filter(p => p.team === "red").length <=
                 Object.values(parties[id].players).filter(p => p.team === "blue").length ? "red" : "blue";

    parties[id].players[socket.id] = {
      id: socket.id,
      name,
      x: 200,
      y: 200,
      team,
      input: {}
    };

    socket.join(id);
    io.to(socket.id).emit("init", {
      id: socket.id,
      allPlayers: parties[id].players,
      ballState: parties[id].ball,
      leader: parties[id].leader,
      pid: id
    });
  });

  socket.on("input", (input) => {
    if (currentParty && parties[currentParty]?.players[socket.id]) {
      parties[currentParty].players[socket.id].input = input;
    }
  });

  socket.on("disconnect", () => {
    if (currentParty && parties[currentParty]) {
      delete parties[currentParty].players[socket.id];
      if (Object.keys(parties[currentParty].players).length === 0) {
        delete parties[currentParty];
      }
    }
  });
});

setInterval(() => {
  for (const partyID in parties) {
    const party = parties[partyID];

    for (const id in party.players) {
      const p = party.players[id];
      const input = p.input || {};

      if (input.left) p.x -= PLAYER_SPEED;
      if (input.right) p.x += PLAYER_SPEED;
      if (input.up) p.y -= PLAYER_SPEED;
      if (input.down) p.y += PLAYER_SPEED;

      // Basit topa vurma
      const dx = p.x - party.ball.x;
      const dy = p.y - party.ball.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (input.kick && dist < 25) {
        const angle = Math.atan2(dy, dx);
        party.ball.vx = -Math.cos(angle) * BALL_SPEED;
        party.ball.vy = -Math.sin(angle) * BALL_SPEED;
      }
    }

    // Top hareketi
    party.ball.x += party.ball.vx;
    party.ball.y += party.ball.vy;
    party.ball.vx *= 0.99;
    party.ball.vy *= 0.99;

    // Duvar çarpması
    if (party.ball.x < BALL_RADIUS || party.ball.x > FIELD_WIDTH - BALL_RADIUS) party.ball.vx *= -1;
    if (party.ball.y < BALL_RADIUS || party.ball.y > FIELD_HEIGHT - BALL_RADIUS) party.ball.vy *= -1;

    io.to(partyID).emit("state", {
      allPlayers: party.players,
      ballState: party.ball
    });
  }
}, 1000 / TICK_RATE);

server.listen(process.env.PORT || 3000, () => {
  console.log("HackBall sunucusu çalışıyor!");
});
