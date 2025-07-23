const WebSocket = require('ws');
const http = require('http');

const PORT = process.env.PORT || 3000;

const server = http.createServer();
const wss = new WebSocket.Server({ server });

let rooms = {}; // { roomId: { players: Map(nickname->ws), ... } }

wss.on('connection', function connection(ws) {
  ws.on('message', function incoming(message) {
    let data;
    try {
      data = JSON.parse(message);
    } catch (e) {
      console.error('Invalid JSON:', message);
      return;
    }

    if (data.type === 'join') {
      const { roomId, nickname } = data;
      if (!rooms[roomId]) {
        rooms[roomId] = {
          players: new Map(),
        };
      }
      rooms[roomId].players.set(nickname, ws);
      ws.roomId = roomId;
      ws.nickname = nickname;

      // Notify all players in room about new player list
      broadcastRoomPlayers(roomId);

    } else if (data.type === 'move') {
      // Broadcast movement to all in room except sender
      const room = rooms[ws.roomId];
      if (!room) return;

      room.players.forEach((clientWs, clientNick) => {
        if (clientWs !== ws && clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({
            type: 'move',
            nickname: ws.nickname,
            x: data.x,
            y: data.y,
            action: data.action // e.g. "kick"
          }));
        }
      });
    }
  });

  ws.on('close', () => {
    if (!ws.roomId || !rooms[ws.roomId]) return;
    rooms[ws.roomId].players.delete(ws.nickname);
    broadcastRoomPlayers(ws.roomId);
  });
});

function broadcastRoomPlayers(roomId) {
  const room = rooms[roomId];
  if (!room) return;

  const playerList = Array.from(room.players.keys());

  room.players.forEach(clientWs => {
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.send(JSON.stringify({
        type: 'players',
        players: playerList,
      }));
    }
  });
}

server.listen(PORT, () => {
  console.log(`✅ HackBall WebSocket server ${PORT} portunda çalışıyor`);
});
