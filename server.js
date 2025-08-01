const http=require('http');
const WebSocket=require('ws');
const server=http.createServer();
const wss=new WebSocket.Server({server});

const rooms={};

function createPlayer(nickname,team){
  const x=team==='red'?100:500;
  const y=Math.random()*300+50;
  return { nickname, team, x, y, pressing:{}, speed:2.5 };
}
function createBall(){ return { x:300,y:200,dx:0,dy:0,radius:10,friction:0.98 }; }

wss.on('connection', ws=>{
  let roomId='', playerId='';
  ws.on('message',msg=>{
    const d=JSON.parse(msg);
    if(d.type==='join'){
      roomId=d.roomId;
      if(!rooms[roomId]){ rooms[roomId]={ players:new Map(), ball:createBall(), score:{red:0,blue:0}, interval:null }; startLoop(roomId); }
      if(!['red','blue'].includes(d.team)){ return ws.send(JSON.stringify({type:'error',message:'Geçersiz takım'})); }
      if(Array.from(rooms[roomId].players.values()).some(p=>p.team===d.team)){
        return ws.send(JSON.stringify({type:'error',message:'Takım dolu'})); }
      playerId=Math.random().toString(36).substr(2,6);
      rooms[roomId].players.set(playerId, { ws, playerId, ...createPlayer(d.nickname,d.team) });
    }
    else if(d.type==='move'){
      const p=rooms[roomId]?.players.get(playerId);
      if(p){ p.pressing[d.dir]=true; setTimeout(()=>p.pressing[d.dir]=false,100); }
    }
    else if(d.type==='chat'){
      const room=rooms[roomId];
      if(room){
        room.players.forEach(pt=>pt.ws.send(JSON.stringify({type:'chat',nickname:rooms[roomId].players.get(playerId).nickname,msg:d.msg})));
      }
    }
  });

  ws.on('close',()=>{
    const room=rooms[roomId];
    if(room && room.players.has(playerId)){
      room.players.delete(playerId);
      if(room.players.size===0){ clearInterval(room.interval); delete rooms[roomId]; }
    }
  });
});

function startLoop(roomId){
  const room=rooms[roomId];
  room.interval=setInterval(()=>{
    const b=room.ball;
    room.players.forEach(p=>{
      let dx=0, dy=0;
      if(p.pressing.up) dy--;
      if(p.pressing.down) dy++;
      if(p.pressing.left) dx--;
      if(p.pressing.right) dx++;
      const len=Math.hypot(dx,dy);
      if(len>0){
        dx/=len; dy/=len;
        p.x+=dx*p.speed; p.y+=dy*p.speed;
        const dist=Math.hypot(p.x-b.x,p.y-b.y);
        if(dist<15+b.radius){
          const ang=Math.atan2(b.y-p.y,b.x-p.x);
          b.dx+=Math.cos(ang)*1.5; b.dy+=Math.sin(ang)*1.5;
        }
      }
      p.x=Math.max(15,Math.min(585,p.x));
      p.y=Math.max(15,Math.min(385,p.y));
    });
    b.x+=b.dx; b.y+=b.dy;
    b.dx*=b.friction; b.dy*=b.friction;
    if(b.x<10||b.x>590) b.dx*=-1;
    if(b.y<10||b.y>390) b.dy*=-1;
    b.x=Math.max(10,Math.min(590,b.x));
    b.y=Math.max(10,Math.min(390,b.y));

    // GOL kontrolü
    if(b.x<10 || b.x>590){
      const team = b.x<10 ? 'blue' : 'red';
      room.score[team]++;
      // reset top ve oyuncular
      b.x=300; b.y=200; b.dx=b.dy=0;
      room.players.forEach(p=>{
        const side = p.team==='red'?100:500;
        p.x=side; p.y=Math.random()*300+50;
      });
    }

    const state={ type:'gameState',
      players:Array.from(room.players.values()).map(p=>({
        playerId:p.playerId, nickname:p.nickname, team:p.team, x:p.x, y:p.y
      })),
      ball:{x:b.x,y:b.y},
      score:room.score
    };
    room.players.forEach(p=>p.ws.send(JSON.stringify(state)));

  },1000/60);
}

const port=process.env.PORT||3000;
server.listen(port,()=>console.log('Server port',port));
