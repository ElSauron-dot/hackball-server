const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

app.use(express.static("public"));

let players = {};
let ball = {
    x: 400,
    y: 300,
    vx: 0,
    vy: 0,
    radius: 10
};

let scores = {
    red: 0,
    blue: 0
};

// ⚽ Kale bölgeleri (solda ve sağda)
const goalSize = { width: 40, height: 200 };
const field = { width: 800, height: 600 };

// 🎮 Yeni oyuncu bağlanınca
io.on("connection", (socket) => {
    console.log("Yeni oyuncu:", socket.id);

    const color = Object.keys(players).length % 2 === 0 ? "red" : "blue";

    players[socket.id] = {
        x: Math.random() * 700 + 50,
        y: Math.random() * 500 + 50,
        color: color
    };

    // Yeni oyuncuya tüm başlangıç verilerini gönder
    socket.emit("init", {
        id: socket.id,
        players,
        ball,
        scores
    });

    // Diğer oyunculara bildir
    socket.broadcast.emit("playerJoined", {
        id: socket.id,
        data: players[socket.id]
    });

    // Hareket güncelleme
    socket.on("move", (pos) => {
        if (players[socket.id]) {
            players[socket.id].x = pos.x;
            players[socket.id].y = pos.y;
        }
    });

    // Bağlantı kesilince
    socket.on("disconnect", () => {
        console.log("Oyuncu ayrıldı:", socket.id);
        delete players[socket.id];
        io.emit("playerLeft", socket.id);
    });
});

// ⏱ Fizik güncelleme döngüsü (60 FPS)
setInterval(() => {
    // Topu hareket ettir
    ball.x += ball.vx;
    ball.y += ball.vy;

    // Sürtünme (yavaşlatma)
    ball.vx *= 0.98;
    ball.vy *= 0.98;

    // Sınır çarpması
    if (ball.x < ball.radius || ball.x > field.width - ball.radius) {
        ball.vx *= -1;
    }
    if (ball.y < ball.radius || ball.y > field.height - ball.radius) {
        ball.vy *= -1;
    }

    // Kale kontrolü
    if (ball.x < goalSize.width && ball.y > 200 && ball.y < 400) {
        scores.blue++;
        resetBall();
    } else if (ball.x > field.width - goalSize.width && ball.y > 200 && ball.y < 400) {
        scores.red++;
        resetBall();
    }

    // Oyuncularla top çarpışması
    for (let id in players) {
        const p = players[id];
        const dx = ball.x - p.x;
        const dy = ball.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < 20 + ball.radius) {
            const angle = Math.atan2(dy, dx);
            ball.vx += Math.cos(angle) * 2;
            ball.vy += Math.sin(angle) * 2;
        }
    }

    // Tüm istemcilere gönder
    io.emit("state", {
        players,
        ball,
        scores
    });
}, 1000 / 60);

// Gol sonrası topu ortala
function resetBall() {
    ball.x = field.width / 2;
    ball.y = field.height / 2;
    ball.vx = 0;
    ball.vy = 0;
}

server.listen(PORT, () => {
    console.log("HackBall sunucusu çalışıyor:", PORT);
});
