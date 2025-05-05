const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;

// Conexión a la base de datos principal
const db = new sqlite3.Database("maiz.db", (err) => {
  if (err) {
    console.error("Error al conectar a maiz.db:", err.message);
  } else {
    console.log("Conectado a la base de datos maiz.db");
  }
});

// Conexión a la base de datos de lugares
const geoDB = new sqlite3.Database("lugares.db", (err) => {
  if (err) {
    console.error("Error al conectar a lugares.db:", err.message);
  } else {
    console.log("Conectado a la base de datos lugares.db");
  }
});

app.use(express.json());


// Obtener todos los reportes
app.get("/reportes", (req, res) => {
  db.all("SELECT * FROM Reporte", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Obtener un reporte por ID
app.get("/reportes/:id", (req, res) => {
  db.get("SELECT * FROM Reporte WHERE id = ?", [req.params.id], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(row);
  });
});

// Crear nuevo reporte
app.post("/reportes", (req, res) => {
  const { fechaGeneracion, descripcion, nombreArchivo, latitud, longitud, estatus } = req.body;
  const query = `INSERT INTO Reporte (fechaGeneracion, descripcion, nombreArchivo, latitud, longitud, estatus)
                 VALUES (?, ?, ?, ?, ?, ?)`;
  db.run(query, [fechaGeneracion, descripcion, nombreArchivo, latitud, longitud, estatus], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

// Actualizar reporte
app.put("/reportes/:id", (req, res) => {
  const { fechaGeneracion, descripcion, nombreArchivo, latitud, longitud, estatus } = req.body;
  const query = `UPDATE Reporte SET fechaGeneracion = ?, descripcion = ?, nombreArchivo = ?, latitud = ?, longitud = ?, estatus = ?
                 WHERE id = ?`;
  db.run(query, [fechaGeneracion, descripcion, nombreArchivo, latitud, longitud, estatus, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Reporte actualizado" });
  });
});

// Eliminar reporte
app.delete("/reportes/:id", (req, res) => {
  db.run("DELETE FROM Reporte WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Reporte eliminado" });
  });
});


// Obtener todas las anomalías
app.get("/anomalias", (req, res) => {
  db.all("SELECT * FROM Anomalia", [], (err, rows) => {
    if (err) return res.status(500).json({ error: err.message });
    res.json(rows);
  });
});

// Crear nueva anomalía
app.post("/anomalias", (req, res) => {
  const { reporteId, latitud, longitud, minutoDetectado, estatus } = req.body;
  const query = `INSERT INTO Anomalia (reporteId, latitud, longitud, minutoDetectado, estatus)
                 VALUES (?, ?, ?, ?, ?)`;
  db.run(query, [reporteId, latitud, longitud, minutoDetectado, estatus], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

// Actualizar anomalía
app.put("/anomalias/:id", (req, res) => {
  const { reporteId, latitud, longitud, minutoDetectado, estatus } = req.body;
  const query = `UPDATE Anomalia SET reporteId = ?, latitud = ?, longitud = ?, minutoDetectado = ?, estatus = ?
                 WHERE id = ?`;
  db.run(query, [reporteId, latitud, longitud, minutoDetectado, estatus, req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Anomalía actualizada" });
  });
});

// Eliminar anomalía
app.delete("/anomalias/:id", (req, res) => {
  db.run("DELETE FROM Anomalia WHERE id = ?", [req.params.id], function(err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Anomalía eliminada" });
  });
});

app.get("/ubicacion/:lat/:lon", (req, res) => {
  const lat = parseFloat(req.params.lat);
  const lon = parseFloat(req.params.lon);

  if (isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({ error: "Parámetros inválidos" });
  }

  const sql = `
    SELECT nombre, lat, lon,
      ((lat - ?) * (lat - ?) + (lon - ?) * (lon - ?)) AS distancia
    FROM lugares
    ORDER BY distancia ASC
    LIMIT 1
  `;

  geoDB.get(sql, [lat, lat, lon, lon], (err, row) => {
    if (err) return res.status(500).json({ error: err.message });
    if (!row) return res.json({ nombre: "Ubicación desconocida" });

    res.json({
      nombre: row.nombre,
      coordenadas: { lat: row.lat, lon: row.lon }
    });
  });
});



app.get('/videos/:videoName', (req, res) => {
  const videoPath = path.join('E:/VideosUAV', req.params.videoName);

  fs.stat(videoPath, (err, stats) => {
    if (err) {
      console.error('Error accediendo al video:', err);
      return res.sendStatus(404);
    }

    const range = req.headers.range;
    if (!range) {
      res.writeHead(200, {
        'Content-Length': stats.size,
        'Content-Type': 'video/mp4',
      });
      fs.createReadStream(videoPath).pipe(res);
    } else {
      const parts = range.replace(/bytes=/, "").split("-");
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunkSize = (end - start) + 1;
      const file = fs.createReadStream(videoPath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${stats.size}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': 'video/mp4',
      });

      file.pipe(res);
    }
  });
});


app.listen(PORT, () => {
  console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});
