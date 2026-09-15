
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA = path.join(ROOT, "data", "data.json");
const UPLOADS = path.join(ROOT, "uploads");

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(UPLOADS));
app.use(express.static(path.join(ROOT, "public")));

if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });
if (!fs.existsSync(DATA)) {
  fs.writeFileSync(DATA, JSON.stringify({
    televisions: [],
    playlists: [],
    media: [],
    establishments: [],
    advertisers: [],
    campaigns: []
  }, null, 2));
}

function load() {
  return JSON.parse(fs.readFileSync(DATA, "utf8"));
}
function save(db) {
  fs.writeFileSync(DATA, JSON.stringify(db, null, 2));
}
function id(prefix="id") {
  return prefix + "_" + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
}
function activationCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i=0;i<6;i++) out += chars[Math.floor(Math.random()*chars.length)];
  return "ML-" + out;
}

const storage = multer.diskStorage({
  destination: (_,__,cb) => cb(null, UPLOADS),
  filename: (_,file,cb) => cb(null, Date.now()+"-"+file.originalname.replace(/[^a-zA-Z0-9._-]/g,"_"))
});
const upload = multer({ storage });

app.get("/", (_,res)=>res.sendFile(path.join(ROOT,"public","index.html")));
app.get("/televisoes", (_,res)=>res.sendFile(path.join(ROOT,"public","televisoes.html")));
app.get("/player", (_,res)=>res.sendFile(path.join(ROOT,"public","player.html")));

app.get("/api/dashboard", (_,res)=>{
  const db=load();
  const now=Date.now();
  const onlineWindow=90000;
  res.json({
    televisions: db.televisions.length,
    online: db.televisions.filter(t=>t.lastSeen && now-Date.parse(t.lastSeen)<onlineWindow).length,
    playlists: db.playlists.length,
    media: db.media.length
  });
});

app.get("/api/televisions", (_,res)=>{
  const db=load();
  const now=Date.now();
  res.json(db.televisions.map(t=>({
    ...t,
    online: !!t.lastSeen && now-Date.parse(t.lastSeen)<90000
  })));
});

app.post("/api/televisions", (req,res)=>{
  const db=load();
  const name=(req.body.name||"").trim();
  const establishment=(req.body.establishment||"").trim();
  const address=(req.body.address||"").trim();
  if(!name) return res.status(400).json({error:"Informe o nome da TV."});
  const tv={
    id:id("tv"),
    name,
    establishment,
    address,
    activationCode: activationCode(),
    activated:false,
    deviceName:"",
    playlistId:null,
    lastSeen:null,
    createdAt:new Date().toISOString()
  };
  db.televisions.push(tv);
  save(db);
  res.json(tv);
});

app.patch("/api/televisions/:id", (req,res)=>{
  const db=load();
  const tv=db.televisions.find(t=>t.id===req.params.id);
  if(!tv) return res.status(404).json({error:"TV não encontrada."});
  ["name","establishment","address","playlistId"].forEach(k=>{
    if(req.body[k]!==undefined) tv[k]=req.body[k];
  });
  save(db);
  res.json(tv);
});

app.post("/api/televisions/:id/regenerate-code", (req,res)=>{
  const db=load();
  const tv=db.televisions.find(t=>t.id===req.params.id);
  if(!tv) return res.status(404).json({error:"TV não encontrada."});
  tv.activationCode=activationCode();
  tv.activated=false;
  tv.deviceName="";
  save(db);
  res.json(tv);
});

app.delete("/api/televisions/:id", (req,res)=>{
  const db=load();
  const i=db.televisions.findIndex(t=>t.id===req.params.id);
  if(i<0) return res.status(404).json({error:"TV não encontrada."});
  db.televisions.splice(i,1);
  save(db);
  res.json({ok:true});
});

app.post("/api/activate", (req,res)=>{
  const db=load();
  const code=(req.body.code||"").trim().toUpperCase();
  const tv=db.televisions.find(t=>t.activationCode===code);
  if(!tv) return res.status(404).json({error:"Código inválido ou expirado."});
  tv.activated=true;
  tv.deviceName=(req.body.deviceName||"TV Player").trim();
  tv.lastSeen=new Date().toISOString();
  save(db);
  res.json({ok:true, tv});
});

app.get("/api/player/:id", (req,res)=>{
  const db=load();
  const tv=db.televisions.find(t=>t.id===req.params.id);
  if(!tv) return res.status(404).json({error:"TV não encontrada."});
  tv.lastSeen=new Date().toISOString();
  save(db);
  const playlist=db.playlists.find(p=>p.id===tv.playlistId) || null;
  const items=playlist ? playlist.items.map(mid=>db.media.find(m=>m.id===mid)).filter(Boolean) : [];
  res.json({tv, playlist, items});
});

app.get("/api/player-by-code/:code", (req,res)=>{
  const db=load();
  const code=(req.params.code||"").toUpperCase();
  const tv=db.televisions.find(t=>t.activationCode===code);
  if(!tv) return res.status(404).json({error:"Código inválido."});
  tv.lastSeen=new Date().toISOString();
  save(db);
  const playlist=db.playlists.find(p=>p.id===tv.playlistId) || null;
  const items=playlist ? playlist.items.map(mid=>db.media.find(m=>m.id===mid)).filter(Boolean) : [];
  res.json({tv, playlist, items});
});

app.get("/api/playlists", (_,res)=>res.json(load().playlists));
app.post("/api/playlists", (req,res)=>{
  const db=load();
  const p={id:id("pl"),name:(req.body.name||"Nova playlist").trim(),items:[]};
  db.playlists.push(p); save(db); res.json(p);
});
app.post("/api/playlists/:id/items", (req,res)=>{
  const db=load();
  const p=db.playlists.find(x=>x.id===req.params.id);
  if(!p) return res.status(404).json({error:"Playlist não encontrada."});
  if(!p.items.includes(req.body.mediaId)) p.items.push(req.body.mediaId);
  save(db); res.json(p);
});

app.get("/api/media", (_,res)=>res.json(load().media));
app.post("/api/media", upload.single("file"), (req,res)=>{
  if(!req.file) return res.status(400).json({error:"Envie um arquivo."});
  const db=load();
  const media={
    id:id("media"),
    name:req.file.originalname,
    url:"/uploads/"+req.file.filename,
    type:req.file.mimetype.startsWith("video/")?"video":"image",
    createdAt:new Date().toISOString()
  };
  db.media.push(media); save(db); res.json(media);
});

app.listen(PORT, ()=>console.log(`Mídia Local rodando em http://localhost:${PORT}`));
