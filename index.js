const express = require("express");
const sqlite3 = require("sqlite3").verbose();
const fs = require('fs');
const path = require('path');
const app = express();
const PORT = 3000;
const axios = require('axios');

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
  db.run(query, [fechaGeneracion, descripcion, nombreArchivo, latitud, longitud, estatus], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});

// Actualizar reporte
app.put("/reportes/:id", (req, res) => {
  const { fechaGeneracion, descripcion, nombreArchivo, latitud, longitud, estatus } = req.body;
  const query = `UPDATE Reporte SET fechaGeneracion = ?, descripcion = ?, nombreArchivo = ?, latitud = ?, longitud = ?, estatus = ?
                 WHERE id = ?`;
  db.run(query, [fechaGeneracion, descripcion, nombreArchivo, latitud, longitud, estatus, req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Reporte actualizado" });
  });
});

// Endpoint sugerido para solo actualizar nombreArchivo
app.patch("/reportes/:id/nombreArchivo", (req, res) => {
  const { nombreArchivo } = req.body;
  const query = `UPDATE Reporte SET nombreArchivo = ? WHERE id = ?`;
  db.run(query, [nombreArchivo, req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Nombre de archivo actualizado" });
  });
});


// Eliminar reporte
app.delete("/reportes/:id", (req, res) => {
  const id = req.params.id;
  
  // Primero eliminar anomalías asociadas
  db.run("DELETE FROM Anomalia WHERE reporteId = ?", [id], function (err) {
    if (err) return res.status(500).json({ error: err.message });

    // Luego eliminar el reporte
    db.run("DELETE FROM Reporte WHERE id = ?", [id], function (err) {
      if (err) return res.status(500).json({ error: err.message });
      res.json({ message: "Reporte y anomalías eliminados" });
    });
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
  const { reporteId, latitud, longitud, nombreFrame, estatus } = req.body;

  const query = `
    INSERT INTO Anomalia (reporteId, latitud, longitud, nombreFrame, estatus)
    VALUES (?, ?, ?, ?, ?)
  `;

  db.run(query, [reporteId, latitud, longitud, nombreFrame, estatus], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ id: this.lastID });
  });
});


app.put("/anomalias/:id/estatus", (req, res) => {
  const { id } = req.params;
  const { estatus } = req.body;

  const updateAnomaliaQuery = `UPDATE Anomalia SET estatus = ? WHERE id = ?`;
  const getReporteIdQuery = `SELECT reporteId FROM Anomalia WHERE id = ?`;
  const getPendientesQuery = `SELECT COUNT(*) as pendientes FROM Anomalia WHERE reporteId = ? AND estatus = 'pendiente'`;
  const updateReporteQuery = `UPDATE Reporte SET estatus = 'resuelto' WHERE id = ?`;

  // Paso 1: Actualizar estatus de la anomalía
  db.run(updateAnomaliaQuery, [estatus, id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    if (this.changes === 0) return res.status(404).json({ error: "Anomalía no encontrada" });

    // Paso 2: Obtener el reporteId de la anomalía
    db.get(getReporteIdQuery, [id], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });

      const reporteId = row.reporteId;

      // Paso 3: Verificar si quedan anomalías pendientes de ese reporte
      db.get(getPendientesQuery, [reporteId], (err, row) => {
        if (err) return res.status(500).json({ error: err.message });

        if (row.pendientes === 0) {
          // Paso 4: Si no hay pendientes, actualizar el reporte a resuelto
          db.run(updateReporteQuery, [reporteId], function (err) {
            if (err) return res.status(500).json({ error: err.message });

            return res.json({ mensaje: "Anomalía y reporte actualizados correctamente" });
          });
        } else {
          // Solo se actualizó la anomalía, aún hay pendientes
          return res.json({ mensaje: "Anomalía actualizada. Aún hay anomalías pendientes." });
        }
      });
    });
  });
});


// Eliminar anomalía
app.delete("/anomalias/:id", (req, res) => {
  db.run("DELETE FROM Anomalia WHERE id = ?", [req.params.id], function (err) {
    if (err) return res.status(500).json({ error: err.message });
    res.json({ message: "Anomalía eliminada" });
  });
});


app.get("/ubicacion/:lat/:lon", async (req, res) => {
  const lat = parseFloat(req.params.lat);
  const lon = parseFloat(req.params.lon);

  if (isNaN(lat) || isNaN(lon)) {
    return res.status(400).json({ error: "Parámetros inválidos" });
  }

  try {
    const nominatimUrl = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}`;
    const response = await axios.get(nominatimUrl, {
      headers: {
        'User-Agent': 'PT2MaizApp/1.0 (ruizjosue26112002@gmail.com)',
      }
    });

    if (response.data && response.data.display_name) {
      return res.json({
        nombre: response.data.display_name,
        coordenadas: { lat, lon }
      });
    }

    throw new Error('Respuesta inválida de la API');
  } catch (apiError) {
    console.warn("No se pudo usar la API externa, usando geoDB...");

    const sql = `
      SELECT nombre, lat, lon,
        ((lat - ?) * (lat - ?) + (lon - ?) * (lon - ?)) AS distancia
      FROM lugares
      ORDER BY distancia ASC
      LIMIT 1
    `;

    geoDB.get(sql, [lat, lat, lon, lon], (err, row) => {
      if (err) return res.status(500).json({ error: err.message });
      if (!row) {
        return res.json({ nombre: "Ubicación desconocida", coordenadas: { lat, lon } });
      }

      res.json({
        nombre: row.nombre,
        coordenadas: { lat: row.lat, lon: row.lon }
      });
    });
  }
});


app.get('/frames/:folderName/:frameName', (req, res) => {
  const { folderName, frameName } = req.params;
  const imagePath = path.join('D:/VideosUAV', folderName, frameName);

  fs.access(imagePath, fs.constants.F_OK, (err) => {
    if (err) {
      console.error('Imagen no encontrada:', imagePath);
      return res.sendStatus(404);
    }

    res.sendFile(path.resolve(imagePath));
  });
});

app.get('/videos/:folderName/:videoName', (req, res) => {
  const { folderName, videoName } = req.params;
  const videoPath = path.join('D:/VideosUAV', folderName, videoName);

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
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
      const chunkSize = end - start + 1;
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



app.get("/coordenadasUGV", async (req, res) => {
  try {
    const response = await axios.get("http://127.0.0.1:7000/coordenadasUGV");
    const { latitud, longitud } = response.data;

    const fecha = new Date().toLocaleDateString("es-MX");
    const hora = new Date().toLocaleTimeString("es-MX", { hour12: false });

    const coordenadas = {
      latitud,
      longitud,
      fecha,
      hora
    };

    res.json(coordenadas);
  } catch (error) {
    console.error("Error al obtener coordenadas del backend Python:", error.message);
    res.status(500).json({ error: "No se pudieron obtener las coordenadas" });
  }
});


function calcularDistanciaMetros(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Radio de la Tierra en metros
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

app.get("/coordenadasUAVEB", async (req, res) => {
  try {
    const [uavRes, ebRes] = await Promise.all([
      axios.get("http://localhost:3000/coordenadasUAV"),
      axios.get("http://localhost:3000/coordenadasEB"),
    ]);

    const uav = uavRes.data;
    const eb = ebRes.data;

    const distancia = calcularDistanciaMetros(
      parseFloat(uav.latitud),
      parseFloat(uav.longitud),
      parseFloat(eb.latitud),
      parseFloat(eb.longitud)
    );

    res.json({ distancia });
  } catch (error) {
    console.error("Error en /coordenadasUAVEB:", error.message);
    res.status(500).json({ error: "Error al obtener las coordenadas del UAV o EB." });
  }
});

app.get("/coordenadasUGVEB", async (req, res) => {
  try {
    const [uavRes, ebRes] = await Promise.all([
      axios.get("http://localhost:3000/coordenadasUGV"),
      axios.get("http://localhost:3000/coordenadasEB"),
    ]);

    const uav = uavRes.data;
    const eb = ebRes.data;

    const distancia = calcularDistanciaMetros(
      parseFloat(uav.latitud),
      parseFloat(uav.longitud),
      parseFloat(eb.latitud),
      parseFloat(eb.longitud)
    );

    res.json({ distancia });
  } catch (error) {
    console.error(
      "Error en /coordenadasUGVEB:", error.message);
    res.status(500).json({ error: "Error al obtener las coordenadas del UAV o EB." });
  }
});


const { spawn } = require('child_process');
app.get('/stream', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'multipart/x-mixed-replace; boundary=frame',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Pragma': 'no-cache'
  });

  const ffmpeg = spawn('ffmpeg', [
    '-f', 'dshow',
    '-i', 'video=USB Video',
    '-f', 'mjpeg',
    '-q:v', '7',
    '-r', '5',
    '-vf', 'scale=640:360',
    '-'
  ]);

  let buffer = Buffer.alloc(0);

  ffmpeg.stdout.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    const start = buffer.indexOf(Buffer.from([0xff, 0xd8])); // JPEG start
    const end = buffer.indexOf(Buffer.from([0xff, 0xd9]));   // JPEG end

    if (start !== -1 && end !== -1 && end > start) {
      const frame = buffer.slice(start, end + 2);
      res.write(`--frame\r\nContent-Type: image/jpeg\r\n\r\n`);
      res.write(frame);
      res.write('\r\n');

      // Reiniciar buffer
      buffer = buffer.slice(end + 2);
    }
  });

  ffmpeg.stderr.on('data', (data) => {

  });

  ffmpeg.on('close', () => {
    res.end();
    console.log('⚠️ ffmpeg terminó el proceso');
  });

  req.on('close', () => {
    ffmpeg.kill('SIGINT');
    console.log('🔌 Cliente desconectado, ffmpeg detenido');
  });
});

let coordenadasUAV = null;

app.post('/api/lora', (req, res) => {
  const { mensaje } = req.body;
  console.log("Mensaje recibido UAV:", mensaje);

  try {
    const parsed = parsearMensajeLoRa(mensaje);
    if (parsed) {
      coordenadasUAV = parsed;
      console.log("Coordenadas UAV parseadas:", coordenadasUAV);
      res.json({ status: "ok" });
    } else {
      res.status(400).json({ error: "Formato no válido" });
    }
  } catch (error) {
    res.status(500).json({ error: "Error al parsear" });
  }
});

let coordenadasEB = null;

app.post('/api/loraEB', (req, res) => {
  const { mensaje } = req.body;
  console.log("Mensaje recibido:", mensaje);

  try {
    const parsed = parsearMensajeLoRa(mensaje);
    if (parsed) {
      coordenadasEB = parsed;
      console.log("Coordenadas EB parseadas:", coordenadasEB);
      res.json({ status: "ok" });
    } else {
      res.status(400).json({ error: "Formato no válido" });
    }
  } catch (error) {
    res.status(500).json({ error: "Error al parsear" });
  }
});

app.get('/coordenadasUAV', (req, res) => {
  if (coordenadasUAV) {
    res.json(coordenadasUAV);
  } else {
    res.status(404).json({ error: "No hay coordenadas aún" });
  }
});

app.get('/coordenadasEB', (req, res) => {
  if (coordenadasEB) {
    res.json(coordenadasEB);
  } else {
    res.status(404).json({ error: "No hay coordenadas de la EB aún" });
  }
});

/*
app.get('/coordenadasEB', (req, res) => {
  const coordenadas = {
    latitud: 19.697975,
    longitud: -99.112012,
    altitud: 2319.5,
    satelites: 8,
    fecha: '21/6/2025',
    hora: '1:57:59'
  };
  res.json(coordenadas);
});


app.get('/coordenadasUAV', (req, res) => {
  const coordenadas = {
    latitud: 19.69827941229586,
    longitud: -99.11194201152587,
    altitud: 2319.5,
    satelites: 8,
    fecha: '21/6/2025',
    hora: '1:57:59'
  };
  res.json(coordenadas);
});
*/

function parsearMensajeLoRa(mensaje) {
  const campos = mensaje.split(',');
  const datos = {};

  for (const campo of campos) {
    if (campo.startsWith("HORA:")) {
      const horaCompleta = campo.substring(5);
      datos.hora = horaCompleta;
    } else {
      const [clave, valor] = campo.split(':');

      switch (clave) {
        case 'LAT':
          datos.latitud = parseFloat(valor);
          break;
        case 'LON':
          datos.longitud = parseFloat(valor);
          break;
        case 'ALT':
          datos.altitud = parseFloat(valor?.replace('m', '')) || null;
          break;
        case 'SAT':
          datos.satelites = parseInt(valor);
          break;
        case 'FECHA':
          datos.fecha = valor;
          break;
        default:

          break;
      }
    }
  }

  if (datos.latitud && datos.longitud) {
    return datos;
  } else {
    return null;
  }
}






let comandoServo = null;

app.get('/apagarServo', (req, res) => {
  comandoServo = 'APAGAR';
  res.send('Comando para apagar servo recibido');
});

app.get('/encenderServo', (req, res) => {
  comandoServo = 'ENCENDER';
  res.send('Comando para encender servo recibido');
});

app.get('/comandoServo', (req, res) => {
  if (comandoServo) {
    res.send(comandoServo);
    comandoServo = null;
  } else {
    res.send(''); 
  }
});


app.listen(3000, '0.0.0.0', () => console.log("Servidor escuchando en 0.0.0.0:3000"));
