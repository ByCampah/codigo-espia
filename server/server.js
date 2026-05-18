// server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
// Servir los archivos visuales de la carpeta public
const path = require('path');
app.use(express.static(path.join(__dirname, '../public')));

const LUGARES = [
    { nombre: "Estación Espacial", roles: ["Científico", "Piloto", "Astrónomo", "Comandante"] },
    { nombre: "Submarino Militar", roles: ["Capitán", "Sonarista", "Cocinero", "Mecánico"] },
    { nombre: "Banco Central", roles: ["Gerente", "Guardia", "Cajero", "Limpiador"] },
    { nombre: "Estadio de Fútbol", roles: ["Director Técnico", "Árbitro", "Jugador", "Vendedor de Panchos"] }
];

let salas = {}; // Aquí guardamos el estado de cada partida

io.on('connection', (socket) => {
    
    // 1. Crear una sala nueva
    socket.on('crearSala', (nombreJugador) => {
        let codigoSala = Math.random().toString(36).substring(2, 6).toUpperCase();
        salas[codigoSala] = {
            id: codigoSala,
            jugadores: [{ id: socket.id, nombre: nombreJugador, rol: "", lugar: "" }],
            enJuego: false
        };
        socket.join(codigoSala);
        socket.emit('salaCreada', { codigoSala, jugadores: salas[codigoSala].jugadores });
    });

    // 2. Unirse a una sala existente
    socket.on('unirseSala', ({ codigoSala, nombreJugador }) => {
        codigoSala = codigoSala.toUpperCase();
        if (salas[codigoSala] && !salas[codigoSala].enJuego) {
            salas[codigoSala].jugadores.push({ id: socket.id, nombre: nombreJugador, rol: "", lugar: "" });
            socket.join(codigoSala);
            io.to(codigoSala).emit('actualizarJugadores', salas[codigoSala].jugadores);
        } else {
            socket.emit('errorConexion', 'La sala no existe o la partida ya empezó.');
        }
    });

    // 3. Iniciar la partida y repartir roles
    socket.on('iniciarPartida', (codigoSala) => {
        let sala = salas[codigoSala];
        if (!sala) return;

        sala.enJuego = true;
        // Elegimos un lugar al azar
        let lugarElegido = LUGARES[Math.floor(Math.random() * LUGARES.length)];
        
        // Elegimos quién va a ser el impostor al azar
        let indiceImpostor = Math.floor(Math.random() * sala.jugadores.length);

        // Mezclamos los roles del lugar para repartir
        let rolesDisponibles = [...lugarElegido.roles];

        sala.jugadores.forEach((jugador, index) => {
            if (index === indiceImpostor) {
                jugador.lugar = "???";
                jugador.rol = "SOS EL IMPOSTOR";
            } else {
                jugador.lugar = lugarElegido.nombre;
                // Si hay más jugadores que roles predefinidos, le damos un rol genérico o repetido
                let rolAsignado = rolesDisponibles.pop() || "Especialista";
                jugador.rol = rolAsignado;
            }
            // Enviamos la info privada a cada jugador individualmente
            io.to(jugador.id).emit('tuRol', { lugar: jugador.lugar, rol: jugador.rol });
        });

        io.to(codigoSala).emit('partidaIniciada');
    });

    socket.on('disconnect', () => {
        // Lógica para limpiar la sala si un jugador se desconecta
        for (let codigo in salas) {
            salas[codigo].jugadores = salas[codigo].jugadores.filter(j => j.id !== socket.id);
            if (salas[codigo].jugadores.length === 0) {
                delete salas[codigo];
            } else {
                io.to(codigo).emit('actualizarJugadores', salas[codigo].jugadores);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor Pro corriendo en puerto ${PORT}`));