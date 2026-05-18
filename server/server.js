// server/server.js
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, '../public')));

const LUGARES = [
    { nombre: "Estación Espacial", roles: ["Científico", "Piloto", "Astrónomo", "Comandante"] },
    { nombre: "Submarino Militar", roles: ["Capitán", "Sonarista", "Cocinero", "Mecánico"] },
    { nombre: "Banco Central", roles: ["Gerente", "Guardia", "Cajero", "Limpiador"] },
    { nombre: "Estadio de Fútbol", roles: ["Director Técnico", "Árbitro", "Jugador", "Vendedor de Panchos"] },
    { nombre: "Universidad (UNSL)", roles: ["Profesor de Física", "Alumno", "Decano", "Buffetero"] }
];

let salas = {};

function mezclarArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

io.on('connection', (socket) => {
    
    // Crear Sala
    socket.on('crearSala', (nombreJugador) => {
        let codigoSala = Math.random().toString(36).substring(2, 6).toUpperCase();
        salas[codigoSala] = {
            id: codigoSala,
            jugadores: [{ id: socket.id, nombre: nombreJugador, vivo: true, esImpostor: false, votosRecibidos: 0 }],
            enJuego: false,
            lugarSecreto: "",
            ordenTurnos: [],
            indiceTurnoActual: 0,
            votosEmitidos: 0,
            rondaActual: 1
        };
        socket.join(codigoSala);
        socket.emit('salaCreada', { codigoSala, jugadores: salas[codigoSala].jugadores });
    });

    // Unirse a Sala
    socket.on('unirseSala', ({ codigoSala, nombreJugador }) => {
        codigoSala = codigoSala.toUpperCase();
        if (salas[codigoSala] && !salas[codigoSala].enJuego) {
            salas[codigoSala].jugadores.push({ id: socket.id, nombre: nombreJugador, vivo: true, esImpostor: false, votosRecibidos: 0 });
            socket.join(codigoSala);
            io.to(codigoSala).emit('actualizarJugadores', salas[codigoSala].jugadores);
        } else {
            socket.emit('errorConexion', 'La sala no existe o la partida ya empezó.');
        }
    });

    // Iniciar / Reiniciar Partida
    socket.on('iniciarPartida', (codigoSala) => {
        let sala = salas[codigoSala];
        if (!sala || sala.jugadores.length < 3) return socket.emit('errorConexion', 'Se necesitan al menos 3 jugadores.');

        sala.enJuego = true;
        sala.rondaActual = 1;
        sala.votosEmitidos = 0;
        
        let lugarElegido = LUGARES[Math.floor(Math.random() * LUGARES.length)];
        sala.lugarSecreto = lugarElegido.nombre;
        
        // Resetear estados
        sala.jugadores.forEach(j => { j.vivo = true; j.esImpostor = false; j.votosRecibidos = 0; });
        
        // Elegir Impostor
        let indiceImpostor = Math.floor(Math.random() * sala.jugadores.length);
        sala.jugadores[indiceImpostor].esImpostor = true;

        // Mezclar turnos aleatorios
        sala.ordenTurnos = mezclarArray(sala.jugadores.map(j => j.id));
        sala.indiceTurnoActual = 0;

        let rolesDisponibles = [...lugarElegido.roles];

        sala.jugadores.forEach((jugador) => {
            if (jugador.esImpostor) {
                io.to(jugador.id).emit('tuRol', { lugar: "???", rol: "SOS EL IMPOSTOR" });
            } else {
                let rolAsignado = rolesDisponibles.pop() || "Especialista";
                io.to(jugador.id).emit('tuRol', { lugar: sala.lugarSecreto, rol: rolAsignado });
            }
        });

        let idTurno = sala.ordenTurnos[sala.indiceTurnoActual];
        let nombreTurno = sala.jugadores.find(j => j.id === idTurno).nombre;

        io.to(codigoSala).emit('partidaIniciada', {
            turnoDe: idTurno,
            nombreTurno: nombreTurno,
            ronda: sala.rondaActual
        });
    });

    // Avanzar Turno de Preguntas
    socket.on('siguienteTurno', (codigoSala) => {
        let sala = salas[codigoSala];
        if (!sala) return;

        let encontrado = false;
        while (!encontrado) {
            sala.indiceTurnoActual++;
            if (sala.indiceTurnoActual >= sala.ordenTurnos.length) break;
            
            let sigId = sala.ordenTurnos[sala.indiceTurnoActual];
            let jug = sala.jugadores.find(j => j.id === sigId);
            if (jug && jug.vivo) encontrado = true;
        }

        // Si todos los vivos ya preguntaron, pasamos a votar
        if (sala.indiceTurnoActual >= sala.ordenTurnos.length) {
            sala.votosEmitidos = 0;
            sala.jugadores.forEach(j => j.votosRecibidos = 0);
            let vivos = sala.jugadores.filter(j => j.vivo);
            io.to(codigoSala).emit('faseVotacion', vivos);
        } else {
            let idTurno = sala.ordenTurnos[sala.indiceTurnoActual];
            let nombreTurno = sala.jugadores.find(j => j.id === idTurno).nombre;
            io.to(codigoSala).emit('cambioTurno', { turnoDe: idTurno, nombreTurno });
        }
    });

    // Procesar Votos
    socket.on('votarJugador', ({ codigoSala, idVotado }) => {
        let sala = salas[codigoSala];
        if (!sala) return;

        let jugadorVotado = sala.jugadores.find(j => j.id === idVotado);
        if (jugadorVotado) jugadorVotado.votosRecibidos++;

        sala.votosEmitidos++;
        let totalVivos = sala.jugadores.filter(j => j.vivo).length;

        if (sala.votosEmitidos >= totalVivos) {
            let vivos = sala.jugadores.filter(j => j.vivo);
            let expulsado = vivos.reduce((max, j) => j.votosRecibidos > max.votosRecibidos ? j : max, vivos[0]);

            expulsado.vivo = false;

            let impostorVivo = sala.jugadores.find(j => j.esImpostor).vivo;
            let cantidadVivos = sala.jugadores.filter(j => j.vivo).length;

            if (!impostorVivo) {
                io.to(codigoSala).emit('finPartida', { ganador: "INOCENTES", detalle: `¡Echaron a ${expulsado.nombre} y era el Impostor!` });
                sala.enJuego = false;
            } else if (cantidadVivos <= 2) {
                let nomImp = sala.jugadores.find(j => j.esImpostor).nombre;
                io.to(codigoSala).emit('finPartida', { ganador: "IMPOSTOR", detalle: `El impostor era ${nomImp}. ¡Se la bancó y ganó!` });
                sala.enJuego = false;
            } else {
                sala.rondaActual++;
                sala.indiceTurnoActual = 0;

                let primerIdVivo = sala.ordenTurnos.find(id => sala.jugadores.find(j => j.id === id).vivo);
                sala.indiceTurnoActual = sala.ordenTurnos.indexOf(primerIdVivo);
                let nombreTurno = sala.jugadores.find(j => j.id === primerIdVivo).nombre;

                io.to(codigoSala).emit('nuevaRondaPreguntas', {
                    ronda: sala.rondaActual,
                    turnoDe: primerIdVivo,
                    nombreTurno: nombreTurno,
                    txtAlerta: `¡Expulsaron a ${expulsado.nombre}! No era el impostor. Empieza la ronda ${sala.rondaActual} de preguntas.`
                });
            }
        }
    });

    socket.on('disconnect', () => {
        for (let codigo in salas) {
            salas[codigo].jugadores = salas[codigo].jugadores.filter(j => j.id !== socket.id);
            if (salas[codigo].jugadores.length === 0) delete salas[codigo];
            else io.to(codigo).emit('actualizarJugadores', salas[codigo].jugadores);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor de Espías Avanzado en puerto ${PORT}`));