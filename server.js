const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);
const PORT = process.env.PORT || 3000;

app.use(express.static(__dirname + "/"));

http.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);
});

// Oyun alanı boyutları
const WIDTH = 900;
const HEIGHT = 520;

let parties = {};

io.on("connection", (socket) => {
  console.log("Yeni bağlantı:", socket.id);

  socket.on("createParty", ({ nick }) => {
    const partyID = Math.random().toString(36).substr(2, 6);
    socket.join(partyID);
    socket.partyID = partyID;
    socket.nick = nick;
    socket.isLeader = true;

    parties[partyID] = {
      players: [socket],
      ball: { x: WIDTH / 2, y: HEIGHT / 2, vx: 0, vy: 0 },
    };

    socket.emit("start", { partyID, isLeader: true });
    console.log(`Parti oluşturuldu: ${partyID}`);
  });

  socket.on("joinParty", ({ nick, partyID }) => {
    if (!parties[partyID]) {
      socket.emit("joinError", "Böyle bir parti yok.");
      return;
    }

    socket.join(partyID);
    socket.partyID = partyID;
    socket.nick = nick;
    socket.isLeader = false;

    parties[partyID].players.push(socket);
    socket.emit("start", { partyID, isLeader: false });
    console.log(`${nick} partisine katıldı: ${partyID}`);
  });

  socket.on("disconnect", () => {
    const partyID = socket.partyID;
    if (!partyID || !parties[partyID]) return;

    parties[partyID].players = parties[partyID].players.filter(p => p !== socket);

    if (parties[partyID].players.length === 0) {
      delete parties[partyID];
      console.log(`Parti silindi: ${partyID}`);
    }
  });

  // Örnek fizik güncelleme (isteğe göre geliştirilecek)
  setInterval(() => {
    for (const id in parties) {
      const party = parties[id];
      const ball = party.ball;

      ball.x += ball.vx;
      ball.y += ball.vy;

      // Sınırlarda sekme
      if (ball.x < 0 || ball.x > WIDTH) ball.vx *= -1;
      if (ball.y < 0 || ball.y > HEIGHT) ball.vy *= -1;

      io.to(id).emit("gameState", {
        ball: { x: ball.x, y: ball.y }
      });
    }
  }, 1000 / 60);
});
