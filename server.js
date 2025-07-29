const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const { v4: uuidv4 } = require("uuid");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

const parties = {};
const TICK_RATE = 60;

const FIELD_WIDTH = 1000;
const FIELD_HEIGHT = 600;
const GOAL_WIDTH = 200;
const GOAL_HEIGHT = 100;

const BALL_RADIUS = 10;
const PLAYER_RADIUS = 15;
const PLAYER_ACCEL = 0.5;
const PLAYER_FRICTION = 0.90;
const BALL_FRICTION = 0.995;
const KICK_FORCE = 6;

function resetBall(ball) {
  ball.x = FIELD_WIDTH / 2;
  ball.y = FIELD_HEIGHT / 2;
  ball.vx = 0;
  ball.vy = 0;
}

io.on("connection", (socket) => {
  let currentParty = null;

  socket.on("createParty", (name) => {
    const partyID = uuidv4().slice(0, 5).toUpperCase();
    parties[partyID] = {
      leader: socket.id,
      players: {},
      ball: { x: FIELD_WIDTH / 2, y: FIELD_HEIGHT / 2, vx: 0, vy: 0 },
      score: { red: 0, blue: 0 }
    };

    currentParty = partyID;
    parties[partyID].players[socket.id] = {
      id: socket.id,
      name,
      x: Math.random() * FIELD_WIDTH,
      y: Math.random() * FIELD_HEIGHT,
      vx: 0,
      vy: 0,
      team: "red",
      input: {}
    };

    socket.join(partyID);
    io.to(socket.id).emit("init", {
      id: socket.id,
      allPlayers: parties[partyID].players,
      ballState: parties[partyID].ball,
      leader: socket.id,
      pid: partyID,
      score: parties[partyID].score
    });
  });

  socket.on("joinParty", ({ name, id }) => {
    if (!parties[id]) {
      socket.emit("joinError", "Geçersiz Parti ID");
      return;
    }

    currentParty = id;
    const team =
      Object.values(parties[id].players).filter(p => p.team === "red").length <=
      Object.values(parties[id].players).filter(p => p.team === "blue").length ? "red" : "blue";

    parties[id].players[socket.id] = {
      id: socket.id,
      name,
      x: Math.random() * FIELD_WIDTH,
      y: Math.random() * FIELD_HEIGHT,
      vx: 0,
      vy: 0,
      team,
      input: {}
    };

    socket.join(id);
    io.to(socket.id).emit("init", {
      id: socket.id,
      allPlayers: parties[id].players,
      ballState: parties[id].ball,
      leader: parties[id].leader,
      pid: id,
      score: parties[id].score
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

      if (input.left) p.vx -= PLAYER_ACCEL;
      if (input.right) p.vx += PLAYER_ACCEL;
      if (input.up) p.vy -= PLAYER_ACCEL;
      if (input.down) p.vy += PLAYER_ACCEL;

      p.x += p.vx;
      p.y += p.vy;
      p.vx *= PLAYER_FRICTION;
      p.vy *= PLAYER_FRICTION;

      // Sınır çarpması
      if (p.x < PLAYER_RADIUS) p.x = PLAYER_RADIUS;
      if (p.x > FIELD_WIDTH - PLAYER_RADIUS) p.x = FIELD_WIDTH - PLAYER_RADIUS;
      if (p.y < PLAYER_RADIUS) p.y = PLAYER_RADIUS;
      if (p.y > FIELD_HEIGHT - PLAYER_RADIUS) p.y = FIELD_HEIGHT - PLAYER_RADIUS;

      // Topa vurma
      const dx = party.ball.x - p.x;
      const dy = party.ball.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (input.kick && dist < PLAYER_RADIUS + BALL_RADIUS) {
        const angle = Math.atan2(dy, dx);
        party.ball.vx += Math.cos(angle) * KICK_FORCE;
        party.ball.vy += Math.sin(angle) * KICK_FORCE;
      }
    }

    // Top hareketi
    party.ball.x += party.ball.vx;
    party.ball.y += party.ball.vy;
    party.ball.vx *= BALL_FRICTION;
    party.ball.vy *= BALL_FRICTION;

    // Duvar çarpması
    if (party.ball.y < BALL_RADIUS || party.ball.y > FIELD_HEIGHT - BALL_RADIUS) {
      party.ball.vy *= -1;
    }

    // Kale kontrolü (Gol algılaması)
    const goalTop = (FIELD_HEIGHT - GOAL_HEIGHT) / 2;
    const goalBottom = goalTop + GOAL_HEIGHT;

    // Sol kale (mavi gol atarsa)
    if (
      party.ball.x < BALL_RADIUS &&
      party.ball.y > goalTop &&
      party.ball.y < goalBottom
    ) {
      party.score.blue += 1;
      resetBall(party.ball);
    }

    // Sağ kale (kırmızı gol atarsa)
    if (
      party.ball.x > FIELD_WIDTH - BALL_RADIUS &&
      party.ball.y > goalTop &&
      party.ball.y < goalBottom
    ) {
      party.score.red += 1;
      resetBall(party.ball);
    }

    io.to(partyID).emit("state", {
      allPlayers: party.players,
      ballState: party.ball,
      score: party.score
    });
  }
}, 1000 / TICK_RATE);

server.listen(process.env.PORT || 3000, () => {
  console.log("HackBall sunucusu çalışıyor!");
});
