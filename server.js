const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const WIDTH = 900;
const HEIGHT = 520;
const GOAL_HEIGHT = 140;
const PLAYER_RADIUS = 15;
const BALL_RADIUS = 10;
const PLAYER_ACCEL = 0.6;
const PLAYER_FRICTION = 0.86;
const BALL_FRICTION = 0.992;
const KICK_FORCE = 7;

let parties = {};

io.on("connection", (socket) => {
  socket.on("createParty", ({ nick }) => {
    if (!nick) return;
    const partyID = Math.random().toString(36).substr(2, 5).toUpperCase();

    parties[partyID] = {
      leader: socket.id,
      players: {},
      ball: { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0 },
      score: { red: 0, blue: 0 },
    };

    parties[partyID].players[socket.id] = {
      id: socket.id,
      nick,
      team: "red",
      x: 100,
      y: HEIGHT / 2,
      vx: 0,
      vy: 0,
      input: {},
    };

    socket.join(partyID);
    socket.emit("start", { partyID, leader: true, players: parties[partyID].players });
  });

  socket.on("joinParty", ({ nick, partyID }) => {
    const party = parties[partyID];
    if (!party) {
      socket.emit("joinError", "Böyle bir parti yok!");
      return;
    }

    const team =
      Object.values(party.players).filter((p) => p.team === "red").length <=
      Object.values(party.players).filter((p) => p.team === "blue").length
        ? "red"
        : "blue";

    party.players[socket.id] = {
      id: socket.id,
      nick,
      team,
      x: team === "red" ? 100 : WIDTH - 100,
      y: HEIGHT / 2,
      vx: 0,
      vy: 0,
      input: {},
    };

    socket.join(partyID);
    socket.emit("start", { partyID, leader: false, players: party.players });
  });

  socket.on("input", (input) => {
    const partyID = findParty(socket.id);
    if (!partyID) return;
    parties[partyID].players[socket.id].input = input;
  });

  socket.on("kickPlayer", ({ targetId }) => {
    const partyID = findParty(socket.id);
    if (!partyID) return;
    if (parties[partyID].leader === socket.id) {
      io.to(targetId).emit("kicked");
      delete parties[partyID].players[targetId];
    }
  });

  socket.on("disconnect", () => {
    const partyID = findParty(socket.id);
    if (!partyID) return;
    delete parties[partyID].players[socket.id];
    if (Object.keys(parties[partyID].players).length === 0) {
      delete parties[partyID];
    }
  });
});

function findParty(id) {
  return Object.keys(parties).find((pid) => parties[pid].players[id]);
}

setInterval(() => {
  for (const pid in parties) {
    const party = parties[pid];
    const ball = party.ball;

    for (const id in party.players) {
      const p = party.players[id];
      const i = p.input || {};

      if (i.left) p.vx -= PLAYER_ACCEL;
      if (i.right) p.vx += PLAYER_ACCEL;
      if (i.up) p.vy -= PLAYER_ACCEL;
      if (i.down) p.vy += PLAYER_ACCEL;

      p.x += p.vx;
      p.y += p.vy;
      p.vx *= PLAYER_FRICTION;
      p.vy *= PLAYER_FRICTION;

      if (p.x < PLAYER_RADIUS) p.x = PLAYER_RADIUS;
      if (p.x > WIDTH - PLAYER_RADIUS) p.x = WIDTH - PLAYER_RADIUS;
      if (p.y < PLAYER_RADIUS) p.y = PLAYER_RADIUS;
      if (p.y > HEIGHT - PLAYER_RADIUS) p.y = HEIGHT - PLAYER_RADIUS;

      // topa vurma
      const dx = ball.x - p.x;
      const dy = ball.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (i.kick && dist < PLAYER_RADIUS + BALL_RADIUS) {
        const angle = Math.atan2(dy, dx);
        ball.vx += Math.cos(angle) * KICK_FORCE;
        ball.vy += Math.sin(angle) * KICK_FORCE;
      }
    }

    // top hareketi
    ball.x += ball.vx;
    ball.y += ball.vy;
    ball.vx *= BALL_FRICTION;
    ball.vy *= BALL_FRICTION;

    if (ball.y < BALL_RADIUS || ball.y > HEIGHT - BALL_RADIUS) ball.vy *= -1;

    const goalTop = (HEIGHT - GOAL_HEIGHT) / 2;
    const goalBottom = goalTop + GOAL_HEIGHT;

    if (ball.x < BALL_RADIUS && ball.y > goalTop && ball.y < goalBottom) {
      party.score.blue++;
      resetBall(ball);
    }
    if (ball.x > WIDTH - BALL_RADIUS && ball.y > goalTop && ball.y < goalBottom) {
      party.score.red++;
      resetBall(ball);
    }

    io.to(pid).emit("state", {
      players: party.players,
      ball,
      score: party.score,
      leader: party.leader,
      partyID: pid,
    });
  }
}, 1000 / 60);

function resetBall(ball) {
  ball.x = WIDTH / 2;
  ball.y = HEIGHT / 2;
  ball.vx = 0;
  ball.vy = 0;
}

server.listen(process.env.PORT || 3000, () => console.log("HackBall çalışıyor"));
