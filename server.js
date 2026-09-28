const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const { Pool } = require("pg");
const { spawn } = require("child_process");
const os = require("os");

const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = "https://fhvqrexbfvnjzzexczgs.supabase.co";
const SUPABASE_KEY = "sb_publishable_2w3nUPnIa2C0kDApJULeOw_8ubHwv6u";

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA = path.join(ROOT, "data", "data.json");
const UPLOADS = path.join(ROOT, "uploads");

if (!fs.existsSync(path.dirname(DATA))) {
  fs.mkdirSync(path.dirname(DATA), { recursive: true });
}

if (!fs.existsSync(UPLOADS)) {
  fs.mkdirSync(UPLOADS, { recursive: true });
}

if (!fs.existsSync(DATA)) {
  fs.writeFileSync(
    DATA,
    JSON.stringify({
      televisions: [],
      playlists: [],
      media: [],
      establishments: [],
      advertisers: [],
      campaigns: []
    }, null, 2)
  );
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/uploads", express.static(UPLOADS));
app.use(express.static(path.join(ROOT, "public")));

const usePostgres = !!process.env.DATABASE_URL;

const pool = usePostgres
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : false
    })
  : null;

async function initDatabase() {
  if (!usePostgres) return;

  await pool.query(`
    CREATE TABLE IF NOT EXISTS televisions (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      establishment TEXT DEFAULT '',
      address TEXT DEFAULT '',
      activation_code TEXT UNIQUE NOT NULL,
      activated BOOLEAN DEFAULT FALSE,
      device_name TEXT DEFAULT '',
      playlist_id TEXT,
      last_seen TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      items JSONB DEFAULT '[]'::jsonb
    );

    CREATE TABLE IF NOT EXISTS media (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  console.log("PostgreSQL conectado e tabelas prontas.");
}

function id(prefix = "id") {
  return (
    prefix +
    "_" +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 7)
  );
}

function activationCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";

  for (let i = 0; i < 6; i++) {
    out += chars[Math.floor(Math.random() * chars.length)];
  }

  return "ML-" + out;
}function load() {
  return JSON.parse(fs.readFileSync(DATA, "utf8"));
}

function save(db) {
  fs.writeFileSync(DATA, JSON.stringify(db, null, 2));
}

const storage = multer.memoryStorage();

const upload = multer({ storage });
// Páginas
app.get("/", (_, res) =>
  res.sendFile(path.join(ROOT, "public", "index.html"))
);

app.get("/televisoes", (_, res) =>
  res.sendFile(path.join(ROOT, "public", "televisoes.html"))
);

app.get("/player", (_, res) =>
  res.sendFile(path.join(ROOT, "public", "player.html"))
);

// Dashboard
app.get("/api/dashboard", async (_, res) => {
  try {
    if (usePostgres) {
      const tvs = await pool.query("SELECT * FROM televisions");
      const playlists = await pool.query("SELECT * FROM playlists");
      const media = await pool.query("SELECT * FROM media");

      const now = Date.now();
      const onlineWindow = 90000;

      return res.json({
        televisions: tvs.rows.length,
        online: tvs.rows.filter(
          t =>
            t.last_seen &&
            now - Date.parse(t.last_seen) < onlineWindow
        ).length,
        playlists: playlists.rows.length,
        media: media.rows.length
      });
    }

    const db = load();
    const now = Date.now();
    const onlineWindow = 90000;

    res.json({
      televisions: db.televisions.length,
      online: db.televisions.filter(
        t =>
          t.lastSeen &&
          now - Date.parse(t.lastSeen) < onlineWindow
      ).length,
      playlists: db.playlists.length,
      media: db.media.length
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro no dashboard." });
  }
});

// Listar TVs
app.get("/api/televisions", async (_, res) => {
  try {
    if (usePostgres) {
      const result = await pool.query(
        "SELECT * FROM televisions ORDER BY created_at DESC"
      );

      const now = Date.now();

      return res.json(
        result.rows.map(t => ({
          id: t.id,
          name: t.name,
          establishment: t.establishment,
          address: t.address,
          activationCode: t.activation_code,
          activated: t.activated,
          deviceName: t.device_name,
          playlistId: t.playlist_id,
          lastSeen: t.last_seen,
          createdAt: t.created_at,
          online:
            !!t.last_seen &&
            now - Date.parse(t.last_seen) < 90000
        }))
      );
    }

    const db = load();
    const now = Date.now();

    res.json(
      db.televisions.map(t => ({
        ...t,
        online:
          !!t.lastSeen &&
          now - Date.parse(t.lastSeen) < 90000
      }))
    );
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao listar TVs." });
  }
});// Criar TV
app.post("/api/televisions", async (req, res) => {
  try {
    const name = (
  req.body.name ||
  req.body.nome ||
  req.body.tvName ||
  req.body.nomeTV ||
  ""
).trim();

const establishment = (
  req.body.establishment ||
  req.body.estabelecimento ||
  ""
).trim();

const address = (
  req.body.address ||
  req.body.endereco ||
  ""
).trim();

    if (!name) {
      return res
        .status(400)
        .json({ error: "Informe o nome da TV." });
    }

    const tv = {
      id: id("tv"),
      name,
      establishment,
      address,
      activationCode: activationCode(),
      activated: false,
      deviceName: "",
      playlistId: null,
      lastSeen: null,
      createdAt: new Date().toISOString()
    };

    if (usePostgres) {
      await pool.query(
        `INSERT INTO televisions
        (id, name, establishment, address, activation_code,
         activated, device_name, playlist_id, last_seen, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          tv.id,
          tv.name,
          tv.establishment,
          tv.address,
          tv.activationCode,
          tv.activated,
          tv.deviceName,
          tv.playlistId,
          tv.lastSeen,
          tv.createdAt
        ]
      );

      return res.json(tv);
    }

    const db = load();
    db.televisions.push(tv);
    save(db);

    res.json(tv);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao criar TV." });
  }
});

// Editar TV
app.patch("/api/televisions/:id", async (req, res) => {
  try {
    if (usePostgres) {
      const current = await pool.query(
        "SELECT * FROM televisions WHERE id = $1",
        [req.params.id]
      );

      if (!current.rows.length) {
        return res
          .status(404)
          .json({ error: "TV não encontrada." });
      }

      const tv = current.rows[0];

      const name =
        req.body.name !== undefined
          ? req.body.name
          : tv.name;

      const establishment =
        req.body.establishment !== undefined
          ? req.body.establishment
          : tv.establishment;

      const address =
        req.body.address !== undefined
          ? req.body.address
          : tv.address;

      const playlistId =
        req.body.playlistId !== undefined
          ? req.body.playlistId
          : tv.playlist_id;

      await pool.query(
        `UPDATE televisions
         SET name=$1,
             establishment=$2,
             address=$3,
             playlist_id=$4
         WHERE id=$5`,
        [
          name,
          establishment,
          address,
          playlistId,
          req.params.id
        ]
      );

      return res.json({
        id: tv.id,
        name,
        establishment,
        address,
        playlistId
      });
    }

    const db = load();

    const tv = db.televisions.find(
      t => t.id === req.params.id
    );

    if (!tv) {
      return res
        .status(404)
        .json({ error: "TV não encontrada." });
    }

    ["name", "establishment", "address", "playlistId"].forEach(
      key => {
        if (req.body[key] !== undefined) {
          tv[key] = req.body[key];
        }
      }
    );

    save(db);

    res.json(tv);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao editar TV." });
  }
});

// Gerar novo código de ativação
app.post(
  "/api/televisions/:id/regenerate-code",
  async (req, res) => {
    try {
      const newCode = activationCode();

      if (usePostgres) {
        const result = await pool.query(
          `UPDATE televisions
           SET activation_code=$1,
               activated=false,
               device_name=''
           WHERE id=$2
           RETURNING *`,
          [newCode, req.params.id]
        );

        if (!result.rows.length) {
          return res
            .status(404)
            .json({ error: "TV não encontrada." });
        }

        const t = result.rows[0];

        return res.json({
          id: t.id,
          name: t.name,
          establishment: t.establishment,
          address: t.address,
          activationCode: t.activation_code,
          activated: t.activated,
          deviceName: t.device_name,
          playlistId: t.playlist_id,
          lastSeen: t.last_seen,
          createdAt: t.created_at
        });
      }

      const db = load();

      const tv = db.televisions.find(
        t => t.id === req.params.id
      );

      if (!tv) {
        return res
          .status(404)
          .json({ error: "TV não encontrada." });
      }

      tv.activationCode = newCode;
      tv.activated = false;
      tv.deviceName = "";

      save(db);

      res.json(tv);
    } catch (e) {
      console.error(e);
      res.status(500).json({
        error: "Erro ao gerar novo código."
      });
    }
  }
);// Excluir TV
app.delete("/api/televisions/:id", async (req, res) => {
  try {
    if (usePostgres) {
      const result = await pool.query(
        "DELETE FROM televisions WHERE id=$1 RETURNING id",
        [req.params.id]
      );

      if (!result.rows.length) {
        return res
          .status(404)
          .json({ error: "TV não encontrada." });
      }

      return res.json({ ok: true });
    }

    const db = load();

    const index = db.televisions.findIndex(
      t => t.id === req.params.id
    );

    if (index < 0) {
      return res
        .status(404)
        .json({ error: "TV não encontrada." });
    }

    db.televisions.splice(index, 1);

    save(db);

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao excluir TV." });
  }
});

// Ativar TV
app.post("/api/activate", async (req, res) => {
  try {
    const code = (req.body.code || "")
      .trim()
      .toUpperCase();

    const deviceName =
      (req.body.deviceName || "TV Player").trim();

    if (usePostgres) {
      const result = await pool.query(
        `UPDATE televisions
         SET activated=true,
             device_name=$1,
             last_seen=NOW()
         WHERE activation_code=$2
         RETURNING *`,
        [deviceName, code]
      );

      if (!result.rows.length) {
        return res
          .status(404)
          .json({ error: "Código inválido ou expirado." });
      }

      const t = result.rows[0];

      return res.json({
        ok: true,
        tv: {
          id: t.id,
          name: t.name,
          establishment: t.establishment,
          address: t.address,
          activationCode: t.activation_code,
          activated: t.activated,
          deviceName: t.device_name,
          playlistId: t.playlist_id,
          lastSeen: t.last_seen,
          createdAt: t.created_at
        }
      });
    }

    const db = load();

    const tv = db.televisions.find(
      t => t.activationCode === code
    );

    if (!tv) {
      return res
        .status(404)
        .json({ error: "Código inválido ou expirado." });
    }

    tv.activated = true;
    tv.deviceName = deviceName;
    tv.lastSeen = new Date().toISOString();

    save(db);

    res.json({
      ok: true,
      tv
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao ativar TV." });
  }
});

// Buscar informações do player por ID
app.get("/api/player/:id", async (req, res) => {
  try {
    if (usePostgres) {
      const tvResult = await pool.query(
        "SELECT * FROM televisions WHERE id=$1",
        [req.params.id]
      );

      if (!tvResult.rows.length) {
        return res
          .status(404)
          .json({ error: "TV não encontrada." });
      }

      const tv = tvResult.rows[0];

      await pool.query(
        "UPDATE televisions SET last_seen=NOW() WHERE id=$1",
        [req.params.id]
      );

      let playlist = null;
      let items = [];

      if (tv.playlist_id) {
        const playlistResult = await pool.query(
          "SELECT * FROM playlists WHERE id=$1",
          [tv.playlist_id]
        );

        if (playlistResult.rows.length) {
          playlist = playlistResult.rows[0];

          const mediaResult = await pool.query(
            "SELECT * FROM media"
          );

          const ids = Array.isArray(playlist.items)
            ? playlist.items
            : [];

          items = ids
            .map(mid =>
              mediaResult.rows.find(m => m.id === mid)
            )
            .filter(Boolean)
            .map(m => ({
              id: m.id,
              name: m.name,
              url: m.url,
              type: m.type,
              createdAt: m.created_at
            }));
        }
      }

      return res.json({
        tv: {
          id: tv.id,
          name: tv.name,
          establishment: tv.establishment,
          address: tv.address,
          activationCode: tv.activation_code,
          activated: tv.activated,
          deviceName: tv.device_name,
          playlistId: tv.playlist_id,
          lastSeen: new Date().toISOString(),
          createdAt: tv.created_at
        },
        playlist: playlist
          ? {
              id: playlist.id,
              name: playlist.name,
              items: playlist.items
            }
          : null,
        items
      });
    }

    const db = load();

    const tv = db.televisions.find(
      t => t.id === req.params.id
    );

    if (!tv) {
      return res
        .status(404)
        .json({ error: "TV não encontrada." });
    }

    tv.lastSeen = new Date().toISOString();

    save(db);

    const playlist =
      db.playlists.find(
        p => p.id === tv.playlistId
      ) || null;

    const items = playlist
      ? playlist.items
          .map(mid =>
            db.media.find(m => m.id === mid)
          )
          .filter(Boolean)
      : [];

    res.json({
      tv,
      playlist,
      items
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro no player." });
  }
});// Buscar player por código de ativação
app.get("/api/player-by-code/:code", async (req, res) => {
  try {
    const code = (req.params.code || "")
      .trim()
      .toUpperCase();

    if (usePostgres) {
      const tvResult = await pool.query(
        "SELECT * FROM televisions WHERE activation_code=$1",
        [code]
      );

      if (!tvResult.rows.length) {
        return res
          .status(404)
          .json({ error: "Código inválido." });
      }

      const tv = tvResult.rows[0];

      await pool.query(
        "UPDATE televisions SET last_seen=NOW() WHERE id=$1",
        [tv.id]
      );

      let playlist = null;
      let items = [];

      if (tv.playlist_id) {
        const playlistResult = await pool.query(
          "SELECT * FROM playlists WHERE id=$1",
          [tv.playlist_id]
        );

        if (playlistResult.rows.length) {
          playlist = playlistResult.rows[0];

          const mediaResult = await pool.query(
            "SELECT * FROM media"
          );

          const ids = Array.isArray(playlist.items)
            ? playlist.items
            : [];

          items = ids
            .map(mid =>
              mediaResult.rows.find(m => m.id === mid)
            )
            .filter(Boolean)
            .map(m => ({
              id: m.id,
              name: m.name,
              url: m.url,
              type: m.type,
              createdAt: m.created_at
            }));
        }
      }

      return res.json({
        tv: {
          id: tv.id,
          name: tv.name,
          establishment: tv.establishment,
          address: tv.address,
          activationCode: tv.activation_code,
          activated: tv.activated,
          deviceName: tv.device_name,
          playlistId: tv.playlist_id,
          lastSeen: new Date().toISOString(),
          createdAt: tv.created_at
        },
        playlist: playlist
          ? {
              id: playlist.id,
              name: playlist.name,
              items: playlist.items
            }
          : null,
        items
      });
    }

    const db = load();

    const tv = db.televisions.find(
      t => t.activationCode === code
    );

    if (!tv) {
      return res
        .status(404)
        .json({ error: "Código inválido." });
    }

    tv.lastSeen = new Date().toISOString();

    save(db);

    const playlist =
      db.playlists.find(
        p => p.id === tv.playlistId
      ) || null;

    const items = playlist
      ? playlist.items
          .map(mid =>
            db.media.find(m => m.id === mid)
          )
          .filter(Boolean)
      : [];

    res.json({
      tv,
      playlist,
      items
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: "Erro ao buscar player."
    });
  }
});

// Listar playlists
app.get("/api/playlists", async (_, res) => {
  try {
    if (usePostgres) {
      const result = await pool.query(
        "SELECT * FROM playlists ORDER BY name"
      );

      return res.json(
        result.rows.map(p => ({
          id: p.id,
          name: p.name,
          items: Array.isArray(p.items) ? p.items : []
        }))
      );
    }

    res.json(load().playlists);
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: "Erro ao listar playlists."
    });
  }
});

// Criar playlist
app.post("/api/playlists", async (req, res) => {
  try {
    const playlist = {
      id: id("pl"),
      name:
        (req.body.name || "Nova playlist").trim(),
      items: []
    };

    if (usePostgres) {
      await pool.query(
        `INSERT INTO playlists (id, name, items)
         VALUES ($1, $2, $3::jsonb)`,
        [
          playlist.id,
          playlist.name,
          JSON.stringify(playlist.items)
        ]
      );

      return res.json(playlist);
    }

    const db = load();

    db.playlists.push(playlist);

    save(db);

    res.json(playlist);
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: "Erro ao criar playlist."
    });
  }
});

// Adicionar mídia à playlist
app.post("/api/playlists/:id/items", async (req, res) => {
  try {
    const mediaId = req.body.mediaId;

    if (!mediaId) {
      return res
        .status(400)
        .json({ error: "Informe a mídia." });
    }

    if (usePostgres) {
      const result = await pool.query(
        "SELECT * FROM playlists WHERE id=$1",
        [req.params.id]
      );

      if (!result.rows.length) {
        return res
          .status(404)
          .json({ error: "Playlist não encontrada." });
      }

      const playlist = result.rows[0];

      const items = Array.isArray(playlist.items)
        ? playlist.items
        : [];

      if (!items.includes(mediaId)) {
        items.push(mediaId);
      }

      await pool.query(
        "UPDATE playlists SET items=$1::jsonb WHERE id=$2",
        [
          JSON.stringify(items),
          req.params.id
        ]
      );

      return res.json({
        id: playlist.id,
        name: playlist.name,
        items
      });
    }

    const db = load();

    const playlist = db.playlists.find(
      x => x.id === req.params.id
    );

    if (!playlist) {
      return res
        .status(404)
        .json({ error: "Playlist não encontrada." });
    }

    if (!playlist.items.includes(mediaId)) {
      playlist.items.push(mediaId);
    }

    save(db);

    res.json(playlist);
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: "Erro ao adicionar mídia."
    });
  }
});

// Excluir playlist
app.delete("/api/playlists/:id", async (req, res) => {
  try {
    const playlistId = req.params.id;

    if (usePostgres) {
      const result = await pool.query(
        "SELECT id FROM playlists WHERE id=$1",
        [playlistId]
      );

      if (!result.rows.length) {
        return res.status(404).json({ error: "Playlist não encontrada." });
      }

      await pool.query(
        "UPDATE televisions SET playlist_id=NULL WHERE playlist_id=$1",
        [playlistId]
      );

      await pool.query(
        "DELETE FROM playlists WHERE id=$1",
        [playlistId]
      );

      return res.json({ ok: true });
    }

    const db = load();
    const index = db.playlists.findIndex(p => p.id === playlistId);

    if (index === -1) {
      return res.status(404).json({ error: "Playlist não encontrada." });
    }

    db.televisions.forEach(tv => {
      if (tv.playlistId === playlistId) {
        tv.playlistId = null;
      }
    });

    db.playlists.splice(index, 1);
    save(db);

    res.json({ ok: true });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: "Erro ao excluir playlist." });
  }
});

// Listar mídias
app.get("/api/media", async (_, res) => {
  try {
    if (usePostgres) {
      const result = await pool.query(
        "SELECT * FROM media ORDER BY created_at DESC"
      );

      return res.json(
        result.rows.map(m => ({
          id: m.id,
          name: m.name,
          url: m.url,
          type: m.type,
          createdAt: m.created_at
        }))
      );
    }

    res.json(load().media);
  } catch (e) {
    console.error(e);
    res.status(500).json({
      error: "Erro ao listar mídias."
    });
  }
});

// Excluir mídia
  app.delete("/api/media/:id", async (req, res) => {
    const mediaId = req.params.id;

    try {
      if (usePostgres) {
        const mediaResult = await pool.query(
          "SELECT * FROM media WHERE id=$1",
          [mediaId]
        );

        if (!mediaResult.rows.length) {
          return res.status(404).json({ error: "Mídia não encontrada." });
        }

        const media = mediaResult.rows[0];

        // Remove o arquivo do Supabase quando a URL pertence ao bucket "midia".
        if (media.url && media.url.includes("/storage/v1/object/public/midia/")) {
          const marker = "/storage/v1/object/public/midia/";
          const storagePath = decodeURIComponent(media.url.split(marker)[1]);

          const { error: storageError } = await supabase.storage
            .from("midia")
            .remove([storagePath]);

          if (storageError) {
            console.error("Erro ao remover arquivo do Supabase:", storageError);
          }
        }

        // Retira a mídia de todas as playlists antes de apagar o registro.
        const playlistsResult = await pool.query(
          "SELECT id, items FROM playlists"
        );

        for (const playlist of playlistsResult.rows) {
          const items = Array.isArray(playlist.items) ? playlist.items : [];
          const filtered = items.filter(item => item !== mediaId);

          if (filtered.length !== items.length) {
            await pool.query(
              "UPDATE playlists SET items=$1::jsonb WHERE id=$2",
              [JSON.stringify(filtered), playlist.id]
            );
          }
        }

        await pool.query(
          "DELETE FROM media WHERE id=$1",
          [mediaId]
        );

        return res.json({ ok: true });
      }

      const db = load();
      const mediaIndex = db.media.findIndex(m => m.id === mediaId);

      if (mediaIndex === -1) {
        return res.status(404).json({ error: "Mídia não encontrada." });
      }

      const media = db.media[mediaIndex];

      if (media.url && media.url.includes("/storage/v1/object/public/midia/")) {
        const marker = "/storage/v1/object/public/midia/";
        const storagePath = decodeURIComponent(media.url.split(marker)[1]);

        const { error: storageError } = await supabase.storage
          .from("midia")
          .remove([storagePath]);

        if (storageError) {
          console.error("Erro ao remover arquivo do Supabase:", storageError);
        }
      }

      db.playlists.forEach(playlist => {
        playlist.items = Array.isArray(playlist.items)
          ? playlist.items.filter(item => item !== mediaId)
          : [];
      });

      db.media.splice(mediaIndex, 1);
      save(db);

      res.json({ ok: true });
    } catch (e) {
      console.error(e);
      res.status(500).json({
        error: "Erro ao excluir mídia."
      });
    }
  });


// Criar anúncio em vídeo
app.post(
  "/api/ads",
  upload.single("file"),
  async (req, res) => {
    let inputPath = "";
    let outputPath = "";

    try {
      if (!req.file) {
        return res.status(400).json({ error: "O vídeo do anúncio não foi recebido." });
      }

      const adName = (
        req.body.name ||
        "Anúncio Mídia Local"
      ).trim();

      const base = "midia-local-ad-" + Date.now();
      inputPath = path.join(os.tmpdir(), base + ".webm");
      outputPath = path.join(os.tmpdir(), base + ".mp4");

      fs.writeFileSync(inputPath, req.file.buffer);

      await new Promise((resolve, reject) => {
        const ff = spawn("ffmpeg", [
          "-y",
          "-i", inputPath,
          "-c:v", "libx264",
          "-preset", "veryfast",
          "-pix_fmt", "yuv420p",
          "-movflags", "+faststart",
          "-an",
          outputPath
        ]);

        let stderr = "";
        ff.stderr.on("data", chunk => {
          stderr += chunk.toString();
        });

        ff.on("error", reject);

        ff.on("close", code => {
          if (code === 0) return resolve();
          reject(new Error("FFmpeg não conseguiu converter o anúncio. " + stderr.slice(-1200)));
        });
      });

      const videoBuffer = fs.readFileSync(outputPath);

      const fileName =
        Date.now() +
        "-" +
        Math.random().toString(36).slice(2, 8) +
        "-anuncio.mp4";

      const { data: uploadedFile, error: uploadError } =
        await supabase.storage
          .from("midia")
          .upload(fileName, videoBuffer, {
            contentType: "video/mp4",
            upsert: false
          });

      if (uploadError) {
        console.error(uploadError);
        return res.status(500).json({
          error: "O anúncio foi criado, mas não foi possível salvá-lo."
        });
      }

      const { data: publicUrlData } =
        supabase.storage
          .from("midia")
          .getPublicUrl(uploadedFile.path);

      const media = {
        id: id("media"),
        name: adName.endsWith(".mp4") ? adName : adName + ".mp4",
        url: publicUrlData.publicUrl,
        type: "video",
        createdAt: new Date().toISOString()
      };

      if (usePostgres) {
        await pool.query(
          `INSERT INTO media
           (id, name, url, type, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            media.id,
            media.name,
            media.url,
            media.type,
            media.createdAt
          ]
        );

        return res.json(media);
      }

      const db = load();
      db.media.push(media);
      save(db);

      res.json(media);
    } catch (e) {
      console.error(e);
      res.status(500).json({
        error: e.message || "Erro ao criar anúncio."
      });
    } finally {
      try {
        if (inputPath && fs.existsSync(inputPath)) fs.unlinkSync(inputPath);
        if (outputPath && fs.existsSync(outputPath)) fs.unlinkSync(outputPath);
      } catch (cleanupError) {
        console.error("Erro ao limpar arquivos temporários:", cleanupError);
      }
    }
  }
);

// Upload de mídia
app.post(
  "/api/media",
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file) {
        return res
          .status(400)
          .json({ error: "Envie um arquivo." });
      }

      const fileExt = path.extname(req.file.originalname);
const fileName =
  Date.now() +
  "-" +
  Math.random().toString(36).slice(2, 8) +
  fileExt;

const { data: uploadedFile, error: uploadError } =
  await supabase.storage
    .from("midia")
    .upload(fileName, req.file.buffer, {
      contentType: req.file.mimetype,
      upsert: false
    });

if (uploadError) {
  console.error(uploadError);
  return res.status(500).json({
    error: "Erro ao enviar arquivo para o Supabase."
  });
}

const { data: publicUrlData } =
  supabase.storage
    .from("midia")
    .getPublicUrl(uploadedFile.path);

const media = {
  id: id("media"),
  name: req.file.originalname,
  url: publicUrlData.publicUrl,
  type: req.file.mimetype.startsWith("video/")
    ? "video"
    : "image",
  createdAt: new Date().toISOString()
};

      if (usePostgres) {
        await pool.query(
          `INSERT INTO media
           (id, name, url, type, created_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            media.id,
            media.name,
            media.url,
            media.type,
            media.createdAt
          ]
        );

        return res.json(media);
      }

      const db = load();

      db.media.push(media);

      save(db);

      res.json(media);
    } catch (e) {
      console.error(e);
      res.status(500).json({
        error: "Erro ao enviar mídia."
      });
    }
  }
);

// Iniciar servidor
async function start() {
  try {
    await initDatabase();

    app.listen(PORT, () => {
      console.log(
        `Mídia Local rodando na porta ${PORT}`
      );
    });
  } catch (e) {
    console.error(
      "Erro ao iniciar o servidor:",
      e
    );

    process.exit(1);
  }
}

start();
