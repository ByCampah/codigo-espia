// public/client.js
const socket = io(window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin);

let miCodigoSala = "";
let miTurno = false;

const pantallas = {
    inicio: document.getElementById('pantalla-inicio'),
    lobby: document.getElementById('pantalla-lobby'),
    juego: document.getElementById('pantalla-juego'),
    votacion: document.getElementById('pantalla-votacion'),
    final: document.getElementById('pantalla-final')
};

function mostrarSola(clave) {
    Object.keys(pantallas).forEach(k => pantallas[k].classList.remove('active'));
    pantallas[clave].classList.add('active');
}

// Botones e Inputs
const inputNombre = document.getElementById('input-nombre');
const inputCodigo = document.getElementById('input-codigo');
const btnCrear = document.getElementById('btn-crear');
const btnUnirse = document.getElementById('btn-unirse');
const btnComenzar = document.getElementById('btn-comenzar');
const btnTerminarTurno = document.getElementById('btn-terminar-turno');
const btnReiniciar = document.getElementById('btn-reiniciar');

btnCrear.addEventListener('click', () => {
    const n = inputNombre.value.trim();
    if (n) socket.emit('crearSala', n);
});

btnUnirse.addEventListener('click', () => {
    const n = inputNombre.value.trim();
    const c = inputCodigo.value.trim().toUpperCase();
    if (n && c) socket.emit('unirseSala', { codigoSala: c, nombreJugador: n });
});

btnComenzar.addEventListener('click', () => { socket.emit('iniciarPartida', miCodigoSala); });
btnTerminarTurno.addEventListener('click', () => { socket.emit('siguienteTurno', miCodigoSala); });
btnReiniciar.addEventListener('click', () => { socket.emit('iniciarPartida', miCodigoSala); });

// Respuestas Servidor
socket.on('salaCreada', ({ codigoSala, jugadores }) => {
    miCodigoSala = codigoSala;
    document.getElementById('codigo-display').innerText = codigoSala;
    btnComenzar.style.display = 'block';
    actualizarListaLobby(jugadores);
    mostrarSola('lobby');
});

socket.on('actualizarJugadores', (jugadores) => {
    if (pantallas.inicio.classList.contains('active')) {
        miCodigoSala = inputCodigo.value.trim().toUpperCase();
        document.getElementById('codigo-display').innerText = miCodigoSala;
        mostrarSola('lobby');
    }
    actualizarListaLobby(jugadores);
});

function actualizarListaLobby(jugadores) {
    document.getElementById('contador-jugadores').innerText = jugadores.length;
    const lista = document.getElementById('lista-jugadores');
    lista.innerHTML = "";
    jugadores.forEach(j => {
        lista.innerHTML += `👤 ${j.nombre}</li>`;
    });
}

socket.on('tuRol', ({ lugar, rol }) => {
    const tarjeta = document.querySelector('.tarjeta-rol');
    document.getElementById('rol-lugar').innerText = lugar;
    document.getElementById('rol-nombre').innerText = rol;
    tarjeta.style.backgroundColor = (lugar === "???") ? "#ff5555" : "#28a745";
});

socket.on('partidaIniciada', ({ turnoDe, nombreTurno, ronda }) => {
    document.getElementById('ronda-num').innerText = ronda;
    mostrarSola('juego');
    manejarTurno(turnoDe, nombreTurno);
});

socket.on('cambioTurno', ({ turnoDe, nombreTurno }) => { manejarTurno(turnoDe, nombreTurno); });

function manejarTurno(turnoDe, nombreTurno) {
    miTurno = (turnoDe === socket.id);
    document.getElementById('indicador-turno').innerText = miTurno ? "¡ES TU TURNO DE PREGUNTAR!" : `Pregunta: ${nombreTurno}`;
    btnTerminarTurno.style.display = miTurno ? 'block' : 'none';
}

socket.on('faseVotacion', (jugadoresVivos) => {
    miTurno = false;
    document.getElementById('alerta-voto-espera').style.display = 'none';
    const contenedor = document.getElementById('lista-votacion');
    contenedor.innerHTML = "";

    jugadoresVivos.forEach(j => {
        const btn = document.createElement('button');
        btn.className = "btn-votar";
        btn.innerText = `👤 Votar a ${j.nombre}`;
        btn.addEventListener('click', () => {
            socket.emit('votarJugador', { codigoSala: miCodigoSala, idVotado: j.id });
            contenedor.innerHTML = "";
            document.getElementById('alerta-voto-espera').style.display = 'block';
        });
        contenedor.appendChild(btn);
    });
    mostrarSola('votacion');
});

socket.on('nuevaRondaPreguntas', ({ ronda, turnoDe, nombreTurno, txtAlerta }) => {
    document.getElementById('ronda-num').innerText = ronda;
    alert(txtAlerta);
    mostrarSola('juego');
    manejarTurno(turnoDe, nombreTurno);
});

socket.on('finPartida', ({ ganador, detalle }) => {
    document.getElementById('ganador-titulo').innerText = `¡GANAN LOS ${ganador}!`;
    document.getElementById('ganador-titulo').style.color = (ganador === "IMPOSTOR") ? "#ff5555" : "#00ff87";
    document.getElementById('ganador-detalle').innerText = detalle;
    mostrarSola('final');
});

socket.on('errorConexion', (mensaje) => alert(mensaje));