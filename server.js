const WebSocket = require("ws");
const http = require("http");

const server = http.createServer();
const wss = new WebSocket.Server({ server });

let parties = {};

wss.on("connection", (ws) => {
  let playerData = {};

  ws.on("message", (message) => {
    try {
      const data = JSON.parse(message);

      if (data.type === "join") {
        const { nickname, partyId, team } = data;
        playerData = { ws, nickname, partyId, team };

        if (!parties[partyId]) {
          parties[partyId] = { players: [], host: nickname };
        }

        parties[partyId].players.push(playerData);

        broadcast(partyId, {
          type: "playersUpdate",
          players: parties[partyId].players.map(p => ({
            nickname: p.nickname,
            team: p.team
          }))
        });
      }
    } catch (err) {
      console.error("Error:", err);
    }
  });

  ws.on("close", () => {
    const { partyId } = playerData;
    if (parties[partyId]) {
      parties[partyId].players = parties[partyId].players.filter(p => p.ws !== ws);
      if (parties[partyId].players.length === 0) delete parties[partyId];
    }
  });
});

function broadcast(partyId, msg) {
  if (!parties[partyId]) return;
  const str = JSON.stringify(msg);
  parties[partyId].players.forEach(p => {
    if (p.ws.readyState === WebSocket.OPEN) {
      p.ws.send(str);
    }
  });
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ HackBall sunucusu ${PORT} portunda çalışıyor`);
});
