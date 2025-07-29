const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const WIDTH = 900;
const HEIGHT = 520;
const FIELD_WIDTH = WIDTH;
const FIELD_HEIGHT = HEIGHT;
const GOAL_WIDTH = 150;
const GOAL_HEIGHT = 120;

const PLAYER_RADIUS = 15;
const BALL_RADIUS = 10;
const PLAYER_ACCEL = 0.6;
const PLAYER_FRICTION = 0.85;
const BALL_FRICTION = 0.995;
const KICK_FORCE = 7;

let parties = {};

io.on("connection", (socket) => {
  socket.on("createParty", ({ nick }) => {
    const partyID = Math.random().toString(36).substr(2, 6).toUpperCase();
    parties[partyID] = {
      players: {},
      ball: { x: FIELD_WIDTH / 2, y: FIELD_HEIGHT / 2, vx: 0, vy: 0 },
      score: { red: 0, blue: 0 }
    };
    socket.join(partyID);
    parties[partyID].players[socket.id] = {
      id: socket.id, nick, team: "red", x: 100, y: FIELD_HEIGHT / 2, vx: 0, vy: 0, input: {}
    };
    socket.emit("start", { partyID });
    io.to(partyID).emit("state", parties[partyID]);
  });

  socket.on("joinParty", ({ nick, partyID }) => {
    const party = parties[partyID];
    if (!party) {
      socket.emit("joinError", "Böyle bir parti yok.");
      return;
    }
    socket.join(partyID);
    const team = Object.values(party.players).filter(p => p.team === "red").length <=
                 Object.values(party.players).filter(p => p.team === "blue").length ? "red" : "blue";
    party.players[socket.id] = {
      id: socket.id, nick, team,
      x: FIELD_WIDTH - 100, y: FIELD_HEIGHT / 2, vx: 0, vy: 0, input: {}
    };
    socket.emit("start", { partyID });
    io.to(partyID).emit("state", party);
  });

  socket.on("input", (input) => {
    const partyID = Object.keys(socket.rooms).find(r => r !== socket.id);
    const party = parties[partyID];
    if (party && party.players[socket.id]) {
      party.players[socket.id].input = input;
    }
  });

  socket.on("disconnect", () => {
    const partyID = Object.keys(socket.rooms).find(r => r !== socket.id);
    const party = parties[partyID];
    if (party && party.players[socket.id]) {
      delete party.players[socket.id];
      if (Object.keys(party.players).length === 0) {
        delete parties[partyID];
      }
    }
  });

  setInterval(() => {
    for (const pid in parties) {
      const party = parties[pid];
      // update players
      for (const id in party.players) {
        const p = party.players[id];
        const inp = p.input || {};
        if (inp.left) p.vx -= PLAYER_ACCEL;
        if (inp.right) p.vx += PLAYER_ACCEL;
        if (inp.up) p.vy -= PLAYER_ACCEL;
        if (inp.down) p.vy += PLAYER_ACCEL;

        p.x += p.vx; p.y += p.vy;
        p.vx *= PLAYER_FRICTION;
        p.vy *= PLAYER_FRICTION;

        if (p.x < PLAYER_RADIUS) p.x = PLAYER_RADIUS;
        if (p.x > FIELD_WIDTH - PLAYER_RADIUS) p.x = FIELD_WIDTH - PLAYER_RADIUS;
        if (p.y < PLAYER_RADIUS) p.y = PLAYER_RADIUS;
        if (p.y > FIELD_HEIGHT - PLAYER_RADIUS) p.y = FIELD_HEIGHT - PLAYER_RADIUS;

        const dx = party.ball.x - p.x;
        const dy = party.ball.y - p.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (inp.kick && dist < PLAYER_RADIUS + BALL_RADIUS) {
          const ang = Math.atan2(dy, dx);
          party.ball.vx += Math.cos(ang) * KICK_FORCE;
          party.ball.vy += Math.sin(ang) * KICK_FORCE;
        }
      }
      // update ball
      const b = party.ball;
      b.x += b.vx; b.y += b.vy;
      b.vx *= BALL_FRICTION; b.vy *= BALL_FRICTION;
      if (b.x < BALL_RADIUS || b.x > FIELD_WIDTH - BALL_RADIUS) b.vx *= -1;
      if (b.y < BALL_RADIUS || b.y > FIELD_HEIGHT - BALL_RADIUS) b.vy *= -1;

      // goal detection
      const goalTop = (FIELD_HEIGHT - GOAL_HEIGHT) / 2;
      const goalBottom = goalTop + GOAL_HEIGHT;
      if (b.x < BALL_RADIUS && b.y > goalTop && b.y < goalBottom) {
        party.score.blue++;
        b.x = FIELD_WIDTH/2; b.y = FIELD_HEIGHT/2; b.vx = b.vy = 0;
      }
      if (b.x > FIELD_WIDTH - BALL_RADIUS && b.y > goalTop && b.y < goalBottom) {
        party.score.red++;
        b.x = FIELD_WIDTH/2; b.y = FIELD_HEIGHT/2; b.vx = b.vy = 0;
      }

      io.to(pid).emit("state", party);
    }
  }, 1000/60);
});

server.listen(process.env.PORT || 3000, () => {
  console.log("HackBall sunucusu çalışıyor.");
});
