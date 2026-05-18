// client.js
// Conexión automática al servidor (detecta si es local o en internet)
const socket = io(window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin);

let miCodigoSala = "";
let esCreador = false;

// Elementos visuales de la interfaz
const pantallaInicio = document.getElementById('pantalla-inicio');
const pantallaLobby = document.getElementById('pantalla-lobby');
const pantallaRol = document.getElementById('pantalla-rol');

// Botones y Campos de Texto
const inputNombre = document.getElementById('input-nombre');
const inputCodigo = document.getElementById('input-codigo');
const btnCrear = document.getElementById('btn-crear');
const btnUnirse = document.getElementById('btn-unirse');
const btnComenzar = document.getElementById('btn-comenzar');
const btnVolver = document.getElementById('btn-volver');

// Cambiar de pantalla de manera limpia
function irAPantalla(pantallaOcultar, pantallaMostrar) {
    pantallaOcultar.classList.remove('active');
    pantallaMostrar.classList.add('active');
}

// ACCIÓN: Crear una Sala
btnCrear.addEventListener('click', () => {
    const nombre = inputNombre.value.trim();
    if (!nombre) return alert('Por favor, ponete un nombre.');
    esCreador = true;
    socket.emit('crearSala', nombre);
});

// ACCIÓN: Unirse a una Sala existente
btnUnirse.addEventListener('click', () => {
    const nombre = inputNombre.value.trim();
    const codigo = inputCodigo.value.trim().toUpperCase();
    if (!nombre || !codigo) return alert('Completá tu nombre y el código de 4 letras.');
    socket.emit('unirseSala', { codigoSala: codigo, nombreJugador: nombre });
});

// ACCIÓN: El creador inicia la partida
btnComenzar.addEventListener('click', () => {
    if (miCodigoSala) {
        socket.emit('iniciarPartida', miCodigoSala);
    }
});

// ACCIÓN: Volver al menú de inicio
btnVolver.addEventListener('click', () => {
    location.reload(); // Recarga la pestaña para reiniciar el estado limpio
});

// RESPUESTA DEL SERVIDOR: Sala creada con éxito
socket.on('salaCreada', ({ codigoSala, jugadores }) => {
    miCodigoSala = codigoSala;
    document.getElementById('codigo-display').innerText = codigoSala;
    btnComenzar.style.display = 'block'; // Mostrar botón de inicio solo al creador
    actualizarListaLobby(jugadores);
    irAPantalla(pantallaInicio, pantallaLobby);
});

// RESPUESTA DEL SERVIDOR: Actualizar lista de jugadores esperando
socket.on('actualizarJugadores', (jugadores) => {
    // Si entramos a la fuerza por unión exitosa
    if (pantallaInicio.classList.contains('active')) {
        miCodigoSala = inputCodigo.value.trim().toUpperCase();
        document.getElementById('codigo-display').innerText = miCodigoSala;
        irAPantalla(pantallaInicio, pantallaLobby);
    }
    actualizarListaLobby(jugadores);
});

function actualizarListaLobby(jugadores) {
    document.getElementById('contador-jugadores').innerText = jugadores.length;
    const lista = document.getElementById('lista-jugadores');
    lista.innerHTML = "";
    jugadores.forEach(j => {
        const li = document.createElement('li');
        li.innerText = `👤 ${j.nombre}`;
        lista.appendChild(li);
    });
}

// RESPUESTA DEL SERVIDOR: Repartición de roles e inicio
socket.on('partidaIniciada', () => {
    irAPantalla(pantallaLobby, pantallaRol);
});

socket.on('tuRol', ({ lugar, rol }) => {
    const tarjeta = document.querySelector('.tarjeta-rol');
    document.getElementById('rol-lugar').innerText = lugar;
    document.getElementById('rol-nombre').innerText = rol;

    // Si es el impostor, pintamos la tarjeta de rojo peligro, sino de verde espía
    if (lugar === "???") {
        tarjeta.style.backgroundColor = "#ff5555"; // Rojo
    } else {
        tarjeta.style.backgroundColor = "#28a745"; // Verde
    }
});

// MANEJO DE ERRORES
socket.on('errorConexion', (mensaje) => {
    alert(mensaje);
});