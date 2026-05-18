// public/client.js - Cliente Espía v1.3.0
const socket = io(window.location.hostname === 'localhost' ? 'http://localhost:3000' : window.location.origin);

let miCodigoSala = "";
let soyCreador = false;
let idSeleccionadoTemporal = null; 

const pantallas = {
    inicio: document.getElementById('pantalla-inicio'),
    lobby: document.getElementById('pantalla-lobby'),
    juego: document.getElementById('pantalla-juego'),
    votacion: document.getElementById('pantalla-votacion'),
    final: document.getElementById('pantalla-final')
};

const panelChat = document.getElementById('bloque-chat-lateral');
const inputChat = document.getElementById('input-chat');
const btnEnviarChat = document.getElementById('btn-enviar-chat');
const chatMensajes = document.getElementById('chat-mensajes');
const listaFaltanVotar = document.getElementById('lista-faltan-votar');

function mostrarSola(clave) {
    Object.keys(pantallas).forEach(k => pantallas[k].classList.remove('active'));
    pantallas[clave].classList.add('active');
    
    // Activar radio lateral de chat si ya salimos de la pantalla de inicio
    if (clave === 'inicio') {
        panelChat.classList.add('oculto-chat');
    } else {
        panelChat.classList.remove('oculto-chat');
    }
}

const inputNombre = document.getElementById('input-nombre');
const inputCodigo = document.getElementById('input-codigo');
const btnCrear = document.getElementById('btn-crear');
const btnUnirse = document.getElementById('btn-unirse');
const btnComenzar = document.getElementById('btn-comenzar');
const btnIrAVotar = document.getElementById('btn-ir-a-votar');
const btnConfirmarVoto = document.getElementById('btn-confirmar-voto');
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
btnIrAVotar.addEventListener('click', () => { socket.emit('forzarVotacion', miCodigoSala); });
btnReiniciar.addEventListener('click', () => { socket.emit('iniciarPartida', miCodigoSala); });

// --- GESTIÓN DEL CHAT ESPÍA ---
btnEnviarChat.addEventListener('click', () => {
    const txt = inputChat.value.trim();
    if (txt) {
        socket.emit('enviar-mensaje-chat', txt);
        inputChat.value = '';
    }
});
inputChat.addEventListener('keypress', (e) => { if (e.key === 'Enter') btnEnviarChat.click(); });

socket.on('nuevo-mensaje-chat', (datos) => {
    const div = document.createElement('div');
    div.classList.add('chat-linea');
    if (datos.id === 'sistema') {
        div.style.color = '#ffaa00';
        div.innerHTML = datos.texto;
    } else {
        const esMio = datos.id === socket.id ? 'mio' : '';
        div.innerHTML = `<span class="chat-user-tag ${esMio}">${datos.nombre}:</span> ${datos.texto}`;
    }
    chatMensajes.appendChild(div);
    chatMensajes.scrollTop = chatMensajes.scrollHeight;
});

btnConfirmarVoto.addEventListener('click', () => {
    if (idSeleccionadoTemporal) {
        socket.emit('votarJugador', { codigoSala: miCodigoSala, idVotado: idSeleccionadoTemporal });
        document.getElementById('lista-votacion').innerHTML = "";
        btnConfirmarVoto.style.display = 'none';
        document.getElementById('alerta-voto-espera').style.display = 'block';
    }
});

socket.on('salaCreada', ({ codigoSala, jugadores }) => {
    miCodigoSala = codigoSala;
    soyCreador = true; 
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
        lista.innerHTML += `<li>👤 ${j.nombre}</li>`;
    });
}

socket.on('tuRol', ({ lugar, rol }) => {
    const tarjeta = document.querySelector('.tarjeta-rol');
    document.getElementById('rol-lugar').innerText = lugar;
    document.getElementById('rol-nombre').innerText = rol;
    tarjeta.style.backgroundColor = (lugar === "???") ? "#ff5555" : "#28a745";
});

socket.on('partidaIniciada', ({ creadorId, ronda }) => {
    document.getElementById('notificacion-ronda').style.display = 'none';
    document.getElementById('ronda-num').innerText = ronda;
    btnIrAVotar.style.display = (socket.id === creadorId) ? 'block' : 'none';
    mostrarSola('juego');
});

socket.on('votosPendientes', (listaNombres) => {
    if (listaFaltanVotar) {
        listaFaltanVotar.innerText = listaNombres.length > 0 ? listaNombres.join(', ') : 'Ninguno, procesando...';
    }
});

socket.on('faseVotacion', ({ jugadoresVivos, esDesempate }) => {
    idSeleccionadoTemporal = null;
    btnConfirmarVoto.style.display = 'none';
    document.getElementById('alerta-voto-espera').style.display = 'none';
    
    const titulo = document.getElementById('titulo-votacion');
    const sub = document.getElementById('sub-votacion');
    const contenedor = document.getElementById('lista-votacion');
    contenedor.innerHTML = "";

    const yoSigoVivo = jugadoresVivos.some(j => j.id === socket.id);

    if (esDesempate) {
        titulo.innerText = "⚡ RONDA DE DESEMPATE";
        titulo.style.color = "#ffaa00";
        sub.innerText = "Empate de sospechas. Voten SOLO entre los implicados:";
    } else {
        titulo.innerText = "🚨 Hora de Votar";
        titulo.style.color = "#00d2ff";
        sub.innerText = "Seleccioná a tu sospechoso y confirmá tu voto abajo:";
    }

    if (!yoSigoVivo && !esDesempate) {
        sub.innerText = "💀 Fuiste expulsado de la organización. Ahora sos ESPECTADOR de la misión.";
        sub.style.color = "#ff5555";
        return;
    }

    jugadoresVivos.forEach(j => {
        if (j.id !== socket.id) {
            const btn = document.createElement('button');
            btn.className = "btn-votar";
            btn.innerText = `👤 Votar a ${j.nombre}`;
            
            btn.addEventListener('click', () => {
                const botones = contenedor.querySelectorAll('.btn-votar');
                botones.forEach(b => b.classList.remove('seleccionado'));
                
                btn.classList.add('seleccionado');
                idSeleccionadoTemporal = j.id;
                btnConfirmarVoto.style.display = 'block';
            });
            contenedor.appendChild(btn);
        }
    });
    mostrarSola('votacion');
});

socket.on('nuevaRondaPreguntas', ({ ronda, mensajeEstado }) => {
    document.getElementById('ronda-num').innerText = ronda;
    const banner = document.getElementById('notificacion-ronda');
    banner.innerText = mensajeEstado;
    banner.style.display = 'block';
    mostrarSola('juego');
});

socket.on('finPartida', ({ ganador, detalle }) => {
    document.getElementById('ganador-titulo').innerText = `¡GANAN LOS ${ganador}!`;
    document.getElementById('ganador-titulo').style.color = (ganador === "IMPOSTOR") ? "#ff5555" : "#00ff87";
    document.getElementById('ganador-detalle').innerText = detalle;
    mostrarSola('final');
});

socket.on('errorConexion', (m) => {
    const errorDiv = document.getElementById('error-pantalla');
    errorDiv.innerText = "⚠️ " + m;
    errorDiv.style.display = 'block';
    setTimeout(() => { errorDiv.style.display = 'none'; }, 4000);
});