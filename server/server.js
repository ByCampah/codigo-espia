// server/server.js - Código Espía v1.3.0
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(path.join(__dirname, '../public')));

let LUGARES = [];
// Cargar lugares desde palabras.txt
try {
    const data = fs.readFileSync(path.join(__dirname, 'palabras.txt'), 'utf8');
    data.split('\n').forEach(linea => {
        const partes = linea.split(',').map(p => p.trim());
        if (partes.length >= 2) {
            const nombre = partes[0];
            const roles = partes.slice(1).filter(r => r.length > 0);
            LUGARES.push({ nombre, roles });
        }
    });
    console.log(`📌 Espía: Se cargaron ${LUGARES.length} lugares desde palabras.txt`);
} catch (err) {
    console.log("⚠️ No se encontró palabras.txt en la carpeta server, usando lista por defecto.");
    LUGARES = [
        { nombre: "Estación Espacial", roles: ["Científico", "Piloto", "Astrónomo", "Comandante"] },
        { nombre: "Submarino Militar", roles: ["Capitán", "Sonarista", "Cocinero", "Mecánico"] },
        { nombre: "Universidad (UNSL)", roles: ["Profesor de Física", "Alumno", "Decano", "Buffetero"] }
    ];
}

let salas = {};

io.on('connection', (socket) => {
    
    socket.on('crearSala', (nombreJugador) => {
        let codigoSala = Math.random().toString(36).substring(2, 6).toUpperCase();
        salas[codigoSala] = {
            id: codigoSala,
            creadorId: socket.id,
            jugadores: [{ id: socket.id, nombre: nombreJugador, vivo: true, esImpostor: false, votosRecibidos: 0, yaVoto: false }],
            enJuego: false,
            lugarSecreto: "",
            votosEmitidos: 0,
            rondaActual: 1,
            faseActual: "LOBBY"
        };
        socket.join(codigoSala);
        socket.salaAsignada = codigoSala;
        socket.emit('salaCreada', { codigoSala, jugadores: salas[codigoSala].jugadores });
    });

    socket.on('unirseSala', ({ codigoSala, nombreJugador }) => {
        codigoSala = codigoSala.toUpperCase();
        if (salas[codigoSala] && !salas[codigoSala].enJuego) {
            salas[codigoSala].jugadores.push({ id: socket.id, nombre: nombreJugador, vivo: true, esImpostor: false, votosRecibidos: 0, yaVoto: false });
            socket.join(codigoSala);
            socket.salaAsignada = codigoSala;
            io.to(codigoSala).emit('actualizarJugadores', salas[codigoSala].jugadores);
            
            io.to(codigoSala).emit('nuevo-mensaje-chat', { id: 'sistema', nombre: '📢', texto: `<strong>${nombreJugador}</strong> se infiltró en el lobby.` });
        } else {
            socket.emit('errorConexion', 'La sala no existe o la partida ya empezó.');
        }
    });

    // --- CHAT DE LA SALA ---
    socket.on('enviar-mensaje-chat', (texto) => {
        const codigo = socket.salaAsignada;
        if (!codigo || !salas[codigo]) return;
        const jugador = salas[codigo].jugadores.find(j => j.id === socket.id);
        if (jugador) {
            io.to(codigo).emit('nuevo-mensaje-chat', {
                id: socket.id,
                nombre: jugador.nombre,
                texto: texto
            });
        }
    });

    socket.on('iniciarPartida', (codigoSala) => {
        let sala = salas[codigoSala];
        if (!sala || sala.jugadores.length < 3) return socket.emit('errorConexion', 'Se necesitan al menos 3 jugadores.');

        sala.enJuego = true;
        sala.rondaActual = 1;
        sala.votosEmitidos = 0;
        sala.faseActual = "JUEGO";
        
        let lugarElegido = LUGARES[Math.floor(Math.random() * LUGARES.length)];
        sala.lugarSecreto = lugarElegido.nombre;
        
        sala.jugadores.forEach(j => { j.vivo = true; j.esImpostor = false; j.votosRecibidos = 0; j.yaVoto = false; });
        
        let indiceImpostor = Math.floor(Math.random() * sala.jugadores.length);
        sala.jugadores[indiceImpostor].esImpostor = true;

        let rolesDisponibles = [...lugarElegido.roles];

        sala.jugadores.forEach((jugador) => {
            if (jugador.esImpostor) {
                io.to(jugador.id).emit('tuRol', { lugar: "???", rol: "SOS EL IMPOSTOR" });
            } else {
                let rolAsignado = rolesDisponibles.pop() || "Especialista";
                io.to(jugador.id).emit('tuRol', { lugar: sala.lugarSecreto, rol: rolAsignado });
            }
        });

        io.to(codigoSala).emit('partidaIniciada', {
            creadorId: sala.creadorId,
            ronda: sala.rondaActual
        });
    });

    function transmitirPendientesVoto(codigoSala) {
        let sala = salas[codigoSala];
        if(!sala) return;
        let faltan = sala.jugadores.filter(j => j.vivo && !j.yaVoto).map(j => j.nombre);
        io.to(codigoSala).emit('votosPendientes', faltan);
    }

    socket.on('forzarVotacion', (codigoSala) => {
        let sala = salas[codigoSala];
        if (!sala) return;

        sala.votosEmitidos = 0;
        sala.faseActual = "VOTACION";
        sala.jugadores.forEach(j => { j.votosRecibidos = 0; j.yaVoto = false; });
        let vivos = sala.jugadores.filter(j => j.vivo);
        
        io.to(codigoSala).emit('faseVotacion', { jugadoresVivos: vivos, esDesempate: false });
        transmitirPendientesVoto(codigoSala);
    });

    socket.on('votarJugador', ({ codigoSala, idVotado }) => {
        let sala = salas[codigoSala];
        if (!sala || sala.faseActual !== "VOTACION") return;

        let votante = sala.jugadores.find(j => j.id === socket.id);
        if (!votante || !votante.vivo || votante.yaVoto) return; 

        votante.yaVoto = true;
        let jugadorVotado = sala.jugadores.find(j => j.id === idVotado);
        if (jugadorVotado) jugadorVotado.votosRecibidos++;

        sala.votosEmitidos++;
        let totalVivos = sala.jugadores.filter(j => j.vivo).length;

        if (sala.votosEmitidos >= totalVivos) {
            let vivos = sala.jugadores.filter(j => j.vivo);
            let maxVotos = Math.max(...vivos.map(j => j.votosRecibidos));
            let empatados = vivos.filter(j => j.votosRecibidos === maxVotos);

            if (empatados.length > 1) {
                sala.votosEmitidos = 0;
                sala.jugadores.forEach(j => { j.votosRecibidos = 0; j.yaVoto = false; });
                io.to(codigoSala).emit('faseVotacion', { jugadoresVivos: empatados, esDesempate: true });
                transmitirPendientesVoto(codigoSala);
                return;
            }

            let expulsado = empatados[0];
            expulsado.vivo = false;

            let impostorVivo = sala.jugadores.find(j => j.esImpostor).vivo;
            let cantidadVivos = sala.jugadores.filter(j => j.vivo).length;

            if (!impostorVivo) {
                io.to(codigoSala).emit('finPartida', { ganador: "INOCENTES", detalle: `¡Echaron a ${expulsado.nombre} y era el Infiltrado! Misión cumplida.` });
                sala.enJuego = false;
                sala.faseActual = "LOBBY";
            } else if (cantidadVivos <= 2) {
                let nomImp = sala.jugadores.find(j => j.esImpostor).nombre;
                io.to(codigoSala).emit('finPartida', { ganador: "IMPOSTOR", detalle: `El impostor era ${nomImp}. ¡Se camufló perfectamente y ganó la ronda!` });
                sala.enJuego = false;
                sala.faseActual = "LOBBY";
            } else {
                sala.rondaActual++;
                sala.faseActual = "JUEGO";
                io.to(codigoSala).emit('nuevaRondaPreguntas', {
                    ronda: sala.rondaActual,
                    mensajeEstado: `¡Expulsaron a ${expulsado.nombre}! No era el impostor.`
                });
            }
        } else {
            transmitirPendientesVoto(codigoSala);
        }
    });

    socket.on('disconnect', () => {
        for (let codigo in salas) {
            salas[codigo].jugadores = salas[codigo].jugadores.filter(j => j.id !== socket.id);
            if (salas[codigo].jugadores.length === 0) {
                delete salas[codigo];
            } else {
                io.to(codigo).emit('actualizarJugadores', salas[codigo].jugadores);
                if(salas[codigo].faseActual === "VOTACION") {
                    transmitirPendientesVoto(codigo);
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor de Espías Avanzado v1.3.0 en puerto ${PORT}`));