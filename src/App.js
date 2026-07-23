// ROTEIRO GÓRDORAS V7.0
// Novidades vs V6: o roteiro deixa de ser só de restaurantes e passa a aceitar
// bares, hotéis, parques, pontos turísticos e outros tipos de lugar, cada um com
// suas próprias categorias de avaliação. Permissões de exclusão ajustadas.

import React, {
  useState, useEffect, useMemo, useRef, useCallback, createContext, useContext
} from 'react';
import { initializeApp } from 'firebase/app';
import {
  getFirestore, collection, addDoc, doc, updateDoc, deleteDoc, onSnapshot,
  arrayUnion, serverTimestamp, runTransaction
} from 'firebase/firestore';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, updateProfile, sendPasswordResetEmail
} from 'firebase/auth';
import { MapContainer, TileLayer, Marker, Popup, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './App.css';

// ============ FIREBASE ============
const firebaseConfig = {
  apiKey: "AIzaSyAlS9cqMucbXgdzDoIPpv62bC6CUXMMTQs",
  authDomain: "roteiro-gordoras.firebaseapp.com",
  projectId: "roteiro-gordoras",
  storageBucket: "roteiro-gordoras.firebasestorage.app",
  messagingSenderId: "197667618881",
  appId: "1:197667618881:web:c3d56530184f3645af46c0"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

// A coleção continua se chamando "restaurantes" para não precisar migrar os
// documentos já existentes. Só o vocabulário da interface mudou para "lugares".
const COLECAO = 'restaurantes';

// ============ CONFIGURAÇÃO DE ACESSO ============

// Os dois donos do app. Ambos podem excluir qualquer lugar e qualquer conteúdo
// antigo. Esta lista precisa ser idêntica à das regras do Firestore.
const DONOS = [
  'zdPKYx2sDpN02IuEsat17a0YdKf1',   // Níkolas
  // 'COLE_AQUI_O_UID_DO_SEU_AMIGO'
];

// true = ninguém vê nada sem estar logado (app privado).
const EXIGIR_LOGIN_PARA_VER = false;

// ============ TIPOS DE LUGAR ============
// Cada tipo traz suas próprias tags sugeridas e suas próprias categorias de
// avaliação — não faz sentido dar nota de "Comida" para um parque.

const TIPOS = {
  restaurante: {
    label: 'Restaurante', icone: '🍽️',
    tags: ['Rodízio', 'Carnes', 'Pizza', 'Japonês', 'Italiano', 'Árabe', 'Vegetariano', 'Fastfood', 'Delivery', 'Fine Dining', 'Casual', 'Café da manhã'],
    categorias: [
      { name: 'Ambiente', icon: '🏠' }, { name: 'Atendimento', icon: '👨‍💼' },
      { name: 'Comida', icon: '🍽️' }, { name: 'Preço', icon: '💰' },
      { name: 'Higiene', icon: '✨' }
    ]
  },
  bar: {
    label: 'Bar', icone: '🍻',
    tags: ['Cerveja artesanal', 'Boteco', 'Drinks', 'Petiscos', 'Música ao vivo', 'Ao ar livre', 'Happy hour'],
    categorias: [
      { name: 'Ambiente', icon: '🏠' }, { name: 'Atendimento', icon: '👨‍💼' },
      { name: 'Bebidas', icon: '🍺' }, { name: 'Petiscos', icon: '🍟' },
      { name: 'Música', icon: '🎵' }, { name: 'Preço', icon: '💰' }
    ]
  },
  cafe: {
    label: 'Café / Padaria', icone: '☕',
    tags: ['Café especial', 'Confeitaria', 'Brunch', 'Pão', 'Bom para trabalhar', 'Wi-Fi'],
    categorias: [
      { name: 'Ambiente', icon: '🏠' }, { name: 'Atendimento', icon: '👨‍💼' },
      { name: 'Café', icon: '☕' }, { name: 'Doces', icon: '🍰' },
      { name: 'Preço', icon: '💰' }
    ]
  },
  hotel: {
    label: 'Hotel / Pousada', icone: '🏨',
    tags: ['Pousada', 'Resort', 'Hostel', 'Pé na areia', 'Piscina', 'Pet friendly', 'Café incluso'],
    categorias: [
      { name: 'Quarto', icon: '🛏️' }, { name: 'Limpeza', icon: '✨' },
      { name: 'Café da manhã', icon: '🥐' }, { name: 'Atendimento', icon: '👨‍💼' },
      { name: 'Localização', icon: '📍' }, { name: 'Preço', icon: '💰' }
    ]
  },
  parque: {
    label: 'Parque / Natureza', icone: '🌳',
    tags: ['Trilha', 'Cachoeira', 'Piquenique', 'Mirante', 'Pet friendly', 'Ciclovia', 'Gratuito'],
    categorias: [
      { name: 'Paisagem', icon: '🏞️' }, { name: 'Estrutura', icon: '🚻' },
      { name: 'Limpeza', icon: '✨' }, { name: 'Segurança', icon: '🛡️' },
      { name: 'Acesso', icon: '🚗' }
    ]
  },
  turismo: {
    label: 'Ponto turístico', icone: '📸',
    tags: ['Vista', 'Histórico', 'Fotogênico', 'Gratuito', 'Guiado', 'Bom para crianças'],
    categorias: [
      { name: 'Vale a visita', icon: '⭐' }, { name: 'Vista', icon: '🌄' },
      { name: 'Estrutura', icon: '🚻' }, { name: 'Movimento', icon: '👥' },
      { name: 'Preço', icon: '💰' }
    ]
  },
  cultura: {
    label: 'Museu / Cultura', icone: '🏛️',
    tags: ['Museu', 'Teatro', 'Cinema', 'Exposição', 'Gratuito', 'Acessível'],
    categorias: [
      { name: 'Acervo', icon: '🖼️' }, { name: 'Curadoria', icon: '📖' },
      { name: 'Estrutura', icon: '🚻' }, { name: 'Acessibilidade', icon: '♿' },
      { name: 'Preço', icon: '💰' }
    ]
  },
  praia: {
    label: 'Praia', icone: '🏖️',
    tags: ['Mar calmo', 'Surf', 'Deserta', 'Quiosques', 'Família', 'Difícil acesso'],
    categorias: [
      { name: 'Água', icon: '🌊' }, { name: 'Areia', icon: '🏖️' },
      { name: 'Estrutura', icon: '🚻' }, { name: 'Movimento', icon: '👥' },
      { name: 'Acesso', icon: '🚗' }
    ]
  },
  balada: {
    label: 'Balada / Show', icone: '🎶',
    tags: ['Eletrônica', 'Rock', 'Samba', 'Sertanejo', 'Ao ar livre', 'Open bar'],
    categorias: [
      { name: 'Ambiente', icon: '🏠' }, { name: 'Música', icon: '🎵' },
      { name: 'Bebidas', icon: '🍹' }, { name: 'Público', icon: '👥' },
      { name: 'Fila', icon: '⏳' }, { name: 'Preço', icon: '💰' }
    ]
  },
  compras: {
    label: 'Compras', icone: '🛍️',
    tags: ['Shopping', 'Feira', 'Mercado', 'Brechó', 'Artesanato', 'Souvenir'],
    categorias: [
      { name: 'Variedade', icon: '🛒' }, { name: 'Preço', icon: '💰' },
      { name: 'Atendimento', icon: '👨‍💼' }, { name: 'Ambiente', icon: '🏠' }
    ]
  },
  outro: {
    label: 'Outro', icone: '📍',
    tags: ['Vale a pena', 'Escondido', 'Gratuito', 'Bom para crianças'],
    categorias: [
      { name: 'Vale a pena', icon: '⭐' }, { name: 'Ambiente', icon: '🏠' },
      { name: 'Atendimento', icon: '👨‍💼' }, { name: 'Preço', icon: '💰' }
    ]
  }
};

const LISTA_TIPOS = Object.keys(TIPOS);

// Documentos antigos não têm o campo "tipo" — todos eram restaurantes.
const tipoDe = (lugar) => (lugar?.tipo && TIPOS[lugar.tipo] ? lugar.tipo : 'restaurante');
const infoTipo = (lugar) => TIPOS[tipoDe(lugar)];

const CENTRO_PADRAO = [-23.5505, -46.6333];

const NAV = [
  { id: 'home', label: 'Início', icon: '🏠' },
  { id: 'busca', label: 'Buscar', icon: '🔍' },
  { id: 'mapa', label: 'Mapa', icon: '🗺️' },
  { id: 'ranking', label: 'Ranking', icon: '🏆' },
  { id: 'conta', label: 'Conta', icon: '👤' }
];

const ERROS_AUTH = {
  'auth/invalid-email': 'E-mail inválido.',
  'auth/user-disabled': 'Esta conta foi desativada.',
  'auth/user-not-found': 'Não existe conta com esse e-mail.',
  'auth/wrong-password': 'E-mail ou senha incorretos.',
  'auth/invalid-credential': 'E-mail ou senha incorretos.',
  'auth/email-already-in-use': 'Já existe uma conta com esse e-mail.',
  'auth/weak-password': 'A senha precisa de pelo menos 6 caracteres.',
  'auth/missing-password': 'Digite uma senha.',
  'auth/too-many-requests': 'Muitas tentativas. Aguarde alguns minutos.',
  'auth/unauthorized-domain': 'Domínio não autorizado no Firebase (Authentication > Settings > Authorized domains).',
  'auth/operation-not-allowed': 'Login por e-mail e senha não está ativado (Authentication > Sign-in method).',
  'auth/admin-restricted-operation': 'Criação de contas está bloqueada nas configurações do Firebase.',
  'auth/configuration-not-found': 'O Authentication ainda não foi iniciado neste projeto Firebase.',
  'auth/invalid-api-key': 'A apiKey do firebaseConfig está incorreta.',
  'auth/network-request-failed': 'Sem conexão com o servidor.'
};

// Mostra a mensagem em português e deixa o código original no console do
// navegador, para dar o que investigar quando a tradução não cobrir o caso.
const traduzirErroAuth = (e) => {
  console.error('[auth]', e?.code, e?.message);
  return ERROS_AUTH[e?.code] || `Não foi possível concluir (${e?.code || 'erro desconhecido'}).`;
};

// ============ LEAFLET ============
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png'
});

// Cada pino do mapa mostra o emoji do tipo de lugar.
const iconeDoLugar = (lugar, favorito) => L.divIcon({
  className: 'pino-tipo',
  html: `<span class="pino-bolha${favorito ? ' fav' : ''}">${infoTipo(lugar).icone}</span>`,
  iconSize: [34, 34],
  iconAnchor: [17, 34],
  popupAnchor: [0, -32]
});

// ============ UTILITÁRIOS ============
const normalizar = (s = '') =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

const notasDe = (lugar) => {
  const notas = [];
  (lugar?.avaliacoes || []).forEach(av => {
    (av?.categorias || []).forEach(cat => {
      if (typeof cat?.estrelas === 'number') notas.push(cat.estrelas);
    });
  });
  return notas;
};

const calcularMedia = (lugar) => {
  const notas = notasDe(lugar);
  if (!notas.length) return 0;
  return +(notas.reduce((a, b) => a + b, 0) / notas.length).toFixed(1);
};

const mediaPorCategoria = (lugar) => {
  const mapa = {};
  (lugar?.avaliacoes || []).forEach(av => {
    (av?.categorias || []).forEach(cat => {
      if (!cat?.name || typeof cat.estrelas !== 'number') return;
      if (!mapa[cat.name]) mapa[cat.name] = { soma: 0, n: 0, icon: cat.icon || '•' };
      mapa[cat.name].soma += cat.estrelas;
      mapa[cat.name].n += 1;
    });
  });
  return Object.entries(mapa)
    .map(([name, v]) => ({ name, icon: v.icon, media: +(v.soma / v.n).toFixed(1), n: v.n }))
    .sort((a, b) => b.media - a.media);
};

const notaPonderada = (lugar, mediaGlobal, peso = 3) => {
  const n = (lugar?.avaliacoes || []).length;
  if (!n) return 0;
  const m = calcularMedia(lugar);
  return +(((peso * mediaGlobal) + (n * m)) / (peso + n)).toFixed(2);
};

const distanciaKm = (lat1, lon1, lat2, lon2) => {
  const R = 6371;
  const rad = (x) => (x * Math.PI) / 180;
  const dLat = rad(lat2 - lat1);
  const dLon = rad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(lat1)) * Math.cos(rad(lat2)) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatarDistancia = (km) =>
  km == null ? null : km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;

const lerLocal = (chave, padrao) => {
  try {
    const v = localStorage.getItem(chave);
    return v ? JSON.parse(v) : padrao;
  } catch {
    return padrao;
  }
};

// Data de hoje no formato do <input type="date">, respeitando o fuso local.
// Usar toISOString() direto devolveria o dia errado à noite no Brasil (UTC-3).
const hojeISO = () => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
};

// Converte "2026-07-20" em "20/07/2026" sem passar por new Date(), que
// interpretaria a string como meia-noite UTC e voltaria um dia no calendário.
const formatarDataISO = (iso) => {
  if (!iso || typeof iso !== 'string') return null;
  const [ano, mes, dia] = iso.split('-');
  return ano && mes && dia ? `${dia}/${mes}/${ano}` : null;
};

// ============ TOASTS ============
const ToastCtx = createContext(() => {});
const useToast = () => useContext(ToastCtx);

function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);

  const mostrar = useCallback((texto, tipo = 'info') => {
    const id = Date.now() + Math.random();
    setToasts(t => [...t, { id, texto, tipo }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3600);
  }, []);

  return (
    <ToastCtx.Provider value={mostrar}>
      {children}
      <div className="toast-area" role="status" aria-live="polite">
        {toasts.map(t => (
          <div key={t.id} className={`toast toast-${t.tipo}`}>
            <span className="toast-icone">
              {t.tipo === 'ok' ? '✓' : t.tipo === 'erro' ? '!' : 'i'}
            </span>
            {t.texto}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ============ AUTENTICAÇÃO E PERMISSÕES ============
const AuthCtx = createContext(null);
const useAuth = () => useContext(AuthCtx);

function AuthProvider({ children }) {
  const [usuario, setUsuario] = useState(null);
  const [carregandoAuth, setCarregandoAuth] = useState(true);

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUsuario(u);
    setCarregandoAuth(false);
  }), []);

  const ehDono = !!usuario && DONOS.includes(usuario.uid);

  // Lugares: qualquer um dos dois donos pode excluir, e quem cadastrou também.
  const podeExcluirLugar = useCallback((lugar) => {
    if (!usuario) return false;
    if (ehDono) return true;
    return !!lugar?.criadoPor && lugar.criadoPor === usuario.uid;
  }, [usuario, ehDono]);

  // Resenhas: só quem escreveu apaga a própria. Resenha antiga, sem autor
  // registrado, pode ser apagada por qualquer um dos donos.
  const podeExcluirResenha = useCallback((avaliacao) => {
    if (!usuario) return false;
    if (avaliacao?.uid) return avaliacao.uid === usuario.uid;
    return ehDono;
  }, [usuario, ehDono]);

  // Editar segue exatamente a mesma regra de excluir: quem manda no lugar
  // manda no cadastro dele, e a resenha é de quem escreveu.
  const valor = useMemo(
    () => ({
      usuario, carregandoAuth, ehDono,
      podeExcluirLugar, podeExcluirResenha,
      podeEditarLugar: podeExcluirLugar,
      podeEditarResenha: podeExcluirResenha
    }),
    [usuario, carregandoAuth, ehDono, podeExcluirLugar, podeExcluirResenha]
  );

  return <AuthCtx.Provider value={valor}>{children}</AuthCtx.Provider>;
}

// ============ COMPONENTES DE UI ============

function Estrelas({ nota, tamanho = 'md' }) {
  const pct = Math.max(0, Math.min(100, (Number(nota) / 5) * 100));
  return (
    <span className={`estrelas-display estrelas-${tamanho}`} aria-label={`${nota} de 5`}>
      <span className="estrelas-vazias" aria-hidden="true">★★★★★</span>
      <span className="estrelas-cheias" style={{ width: `${pct}%` }} aria-hidden="true">★★★★★</span>
    </span>
  );
}

function SeletorEstrelas({ valor, onChange, rotulo }) {
  const [hover, setHover] = useState(0);
  const exibido = hover || valor;
  return (
    <div className="estrelas-selector" role="radiogroup" aria-label={rotulo}
      onMouseLeave={() => setHover(0)}>
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" role="radio" aria-checked={valor === n}
          aria-label={`${n} estrela${n > 1 ? 's' : ''}`}
          className={`estrela ${exibido >= n ? 'ativa' : ''}`}
          onMouseEnter={() => setHover(n)} onFocus={() => setHover(n)} onBlur={() => setHover(0)}
          onClick={() => onChange(n)}>★</button>
      ))}
      <span className="estrelas-valor">{exibido.toFixed(1)}</span>
    </div>
  );
}

function BarraCategoria({ item }) {
  return (
    <div className="barra-cat">
      <span className="barra-cat-nome"><span aria-hidden="true">{item.icon}</span> {item.name}</span>
      <span className="barra-cat-trilho">
        <span className="barra-cat-preenchida" style={{ width: `${(item.media / 5) * 100}%` }} />
      </span>
      <span className="barra-cat-valor">{item.media.toFixed(1)}</span>
    </div>
  );
}

function SeloTipo({ lugar }) {
  const t = infoTipo(lugar);
  return <span className="selo-tipo"><span aria-hidden="true">{t.icone}</span> {t.label}</span>;
}

function Esqueleto({ linhas = 3 }) {
  return (
    <div className="esqueleto-lista">
      {Array.from({ length: linhas }).map((_, i) => (
        <div key={i} className="esqueleto-card">
          <div className="esqueleto-bloco" style={{ width: '55%', height: 18 }} />
          <div className="esqueleto-bloco" style={{ width: '35%', height: 12 }} />
          <div className="esqueleto-bloco" style={{ width: '80%', height: 12 }} />
        </div>
      ))}
    </div>
  );
}

function Vazio({ icone, titulo, texto, acao }) {
  return (
    <div className="estado-vazio">
      <div className="estado-vazio-icone" aria-hidden="true">{icone}</div>
      <h3>{titulo}</h3>
      <p>{texto}</p>
      {acao}
    </div>
  );
}

function Cabecalho({ titulo, onVoltar, acao }) {
  return (
    <div className="pagina-header">
      {onVoltar && <button className="btn-back" onClick={onVoltar} aria-label="Voltar">←</button>}
      <h2>{titulo}</h2>
      <div className="pagina-header-acao">{acao}</div>
    </div>
  );
}

function Confirmacao({ aberto, titulo, texto, rotuloConfirmar = 'Excluir', ocupado, onConfirmar, onCancelar }) {
  useEffect(() => {
    if (!aberto) return;
    const fechar = (e) => e.key === 'Escape' && onCancelar();
    window.addEventListener('keydown', fechar);
    return () => window.removeEventListener('keydown', fechar);
  }, [aberto, onCancelar]);

  if (!aberto) return null;

  return (
    <div className="modal-fundo" onClick={onCancelar}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={titulo}
        onClick={e => e.stopPropagation()}>
        <h3>{titulo}</h3>
        <p>{texto}</p>
        <div className="modal-botoes">
          <button className="btn-secondary" onClick={onCancelar} disabled={ocupado}>Cancelar</button>
          <button className="btn-perigo" onClick={onConfirmar} disabled={ocupado}>
            {ocupado ? 'Excluindo…' : rotuloConfirmar}
          </button>
        </div>
      </div>
    </div>
  );
}

// Barra rolável de filtros por tipo de lugar.
function FiltroTipos({ valor, onChange, contagens }) {
  return (
    <div className="filtro-tipos" role="group" aria-label="Filtrar por tipo de lugar">
      <button className={`chip-tipo ${!valor ? 'ativo' : ''}`} onClick={() => onChange('')}>
        Todos
      </button>
      {LISTA_TIPOS.filter(t => !contagens || contagens[t]).map(t => (
        <button key={t} className={`chip-tipo ${valor === t ? 'ativo' : ''}`}
          onClick={() => onChange(valor === t ? '' : t)}>
          <span aria-hidden="true">{TIPOS[t].icone}</span> {TIPOS[t].label}
          {contagens && <span className="chip-contagem">{contagens[t]}</span>}
        </button>
      ))}
    </div>
  );
}

// ============ LOGIN / CADASTRO ============
function PaginaLogin({ onVoltar, onSucesso, motivo }) {
  const toast = useToast();
  const [modo, setModo] = useState('entrar');
  const [nome, setNome] = useState('');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  const enviar = async () => {
    if (!email.trim()) return toast('Informe seu e-mail', 'erro');
    setOcupado(true);
    try {
      if (modo === 'recuperar') {
        await sendPasswordResetEmail(auth, email.trim());
        toast('Enviamos um link de redefinição para o seu e-mail', 'ok');
        setModo('entrar');
        return;
      }
      if (senha.length < 6) return toast('A senha precisa de pelo menos 6 caracteres', 'erro');

      if (modo === 'criar') {
        if (nome.trim().length < 2) return toast('Informe o nome que vai assinar suas resenhas', 'erro');
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), senha);
        await updateProfile(cred.user, { displayName: nome.trim() });
        toast(`Bem-vindo, ${nome.trim()}`, 'ok');
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), senha);
        toast('Login feito', 'ok');
      }
      onSucesso();
    } catch (e) {
      toast(traduzirErroAuth(e), 'erro');
    } finally {
      setOcupado(false);
    }
  };

  const titulos = { entrar: 'Entrar', criar: 'Criar conta', recuperar: 'Recuperar senha' };

  return (
    <div className="login-page">
      <Cabecalho titulo={titulos[modo]} onVoltar={onVoltar} />
      {motivo && <p className="aviso-motivo">{motivo}</p>}

      <div className="login-form">
        {modo === 'criar' && (
          <div className="form-group">
            <label htmlFor="l-nome">Nome</label>
            <input id="l-nome" type="text" value={nome} onChange={e => setNome(e.target.value)}
              placeholder="Como você assina as resenhas" autoComplete="name" />
          </div>
        )}

        <div className="form-group">
          <label htmlFor="l-email">E-mail</label>
          <input id="l-email" type="email" value={email} onChange={e => setEmail(e.target.value)}
            placeholder="seu@email.com" autoComplete="email" />
        </div>

        {modo !== 'recuperar' && (
          <div className="form-group">
            <label htmlFor="l-senha">Senha</label>
            <div className="campo-senha">
              <input id="l-senha" type={mostrarSenha ? 'text' : 'password'} value={senha}
                onChange={e => setSenha(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && enviar()}
                placeholder="Mínimo 6 caracteres"
                autoComplete={modo === 'criar' ? 'new-password' : 'current-password'} />
              <button type="button" className="btn-ver-senha" onClick={() => setMostrarSenha(v => !v)}
                aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}>
                {mostrarSenha ? '🙈' : '👁️'}
              </button>
            </div>
          </div>
        )}

        <div className="form-buttons">
          <button className="btn-primary" onClick={enviar} disabled={ocupado}>
            {ocupado ? 'Aguarde…' :
              modo === 'criar' ? 'Criar conta' :
              modo === 'recuperar' ? 'Enviar link' : 'Entrar'}
          </button>
        </div>

        <div className="login-alternativas">
          {modo === 'entrar' ? (
            <>
              <button className="link-btn" onClick={() => setModo('criar')}>Criar uma conta</button>
              <button className="link-btn" onClick={() => setModo('recuperar')}>Esqueci a senha</button>
            </>
          ) : (
            <button className="link-btn" onClick={() => setModo('entrar')}>Já tenho conta</button>
          )}
        </div>
      </div>
    </div>
  );
}

// ============ CONTA ============
function PaginaConta({ lugares, favoritos, onVoltar, onNavigate, onSelect }) {
  const { usuario, ehDono } = useAuth();
  const toast = useToast();
  const [editandoNome, setEditandoNome] = useState(false);
  const [novoNome, setNovoNome] = useState(usuario?.displayName || '');
  const [salvando, setSalvando] = useState(false);

  const minhasResenhas = useMemo(() => {
    if (!usuario) return [];
    const lista = [];
    lugares.forEach(l => (l.avaliacoes || []).forEach(av => {
      if (av.uid === usuario.uid) lista.push({ ...av, lugar: l });
    }));
    return lista.sort((a, b) => String(b.id).localeCompare(String(a.id)));
  }, [lugares, usuario]);

  const meusLugares = useMemo(
    () => (usuario ? lugares.filter(l => l.criadoPor === usuario.uid) : []),
    [lugares, usuario]
  );

  const salvarNome = async () => {
    if (novoNome.trim().length < 2) return toast('Nome muito curto', 'erro');
    setSalvando(true);
    try {
      await updateProfile(auth.currentUser, { displayName: novoNome.trim() });
      toast('Nome atualizado', 'ok');
      setEditandoNome(false);
    } catch {
      toast('Não foi possível atualizar o nome', 'erro');
    } finally {
      setSalvando(false);
    }
  };

  const sair = async () => {
    await signOut(auth);
    toast('Você saiu da conta', 'ok');
    onNavigate('home');
  };

  const copiarUid = async () => {
    try {
      await navigator.clipboard.writeText(usuario.uid);
      toast('UID copiado', 'ok');
    } catch {
      toast('Não foi possível copiar', 'erro');
    }
  };

  if (!usuario) {
    return (
      <div className="conta-page">
        <Cabecalho titulo="Conta" onVoltar={onVoltar} />
        <Vazio icone="👤" titulo="Você não está logado"
          texto="Entre para avaliar lugares, cadastrar novos e gerenciar o que é seu."
          acao={<button className="btn-primary" onClick={() => onNavigate('login')}>Entrar ou criar conta</button>} />
      </div>
    );
  }

  return (
    <div className="conta-page">
      <Cabecalho titulo="Conta" onVoltar={onVoltar} />

      <div className="perfil-cartao">
        <span className="perfil-avatar" aria-hidden="true">
          {(usuario.displayName || usuario.email || '?').charAt(0).toUpperCase()}
        </span>
        <div className="perfil-dados">
          {editandoNome ? (
            <div className="perfil-editar">
              <input value={novoNome} onChange={e => setNovoNome(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && salvarNome()} aria-label="Novo nome" />
              <button className="btn-chip" onClick={salvarNome} disabled={salvando}>Salvar</button>
              <button className="link-btn" onClick={() => setEditandoNome(false)}>Cancelar</button>
            </div>
          ) : (
            <>
              <strong>
                {usuario.displayName || 'Sem nome'}
                {ehDono && <span className="selo-admin">dono</span>}
              </strong>
              <span className="perfil-email">{usuario.email}</span>
              <button className="link-btn"
                onClick={() => { setNovoNome(usuario.displayName || ''); setEditandoNome(true); }}>
                Editar nome
              </button>
            </>
          )}
        </div>
      </div>

      <div className="conta-numeros">
        <button className="conta-numero" onClick={() => onNavigate('favoritos')}>
          <strong>{favoritos.length}</strong><span>salvos</span>
        </button>
        <div className="conta-numero"><strong>{minhasResenhas.length}</strong><span>resenhas</span></div>
        <div className="conta-numero"><strong>{meusLugares.length}</strong><span>cadastrados</span></div>
      </div>

      {minhasResenhas.length > 0 && (
        <section className="secao">
          <div className="secao-titulo"><h2>Minhas resenhas</h2></div>
          <div className="tabela-stats">
            {minhasResenhas.map(av => (
              <button key={av.id} className="tabela-row linha-clicavel" onClick={() => onSelect(av.lugar)}>
                <div className="tabela-cell nome">{infoTipo(av.lugar).icone} {av.lugar.nome}</div>
                <div className="tabela-cell avaliacoes">{av.data}</div>
                <div className="tabela-cell media">→</div>
              </button>
            ))}
          </div>
        </section>
      )}

      <section className="secao">
        <div className="secao-titulo"><h2>Sessão</h2></div>
        <div className="lista-acoes">
          <button className="acao-linha" onClick={() => onNavigate('favoritos')}>❤️ Lugares salvos</button>
          <button className="acao-linha" onClick={() => onNavigate('stats')}>📊 Estatísticas</button>
          <button className="acao-linha" onClick={() => onNavigate('contato')}>✉️ Contato</button>
          <button className="acao-linha" onClick={copiarUid}>🆔 Copiar meu UID</button>
          <button className="acao-linha perigo" onClick={sair}>🚪 Sair da conta</button>
        </div>
        <p className="hint hint-uid">
          Cole seu UID na lista <code>DONOS</code> do App.js e nas regras do Firestore.
        </p>
      </section>
    </div>
  );
}

// ============ CARD DE LUGAR ============
function CardLugar({ lugar, onSelect, favorito, onToggleFavorito, distancia, posicao }) {
  const media = calcularMedia(lugar);
  const total = (lugar.avaliacoes || []).length;

  return (
    <article className="card-lugar" onClick={() => onSelect(lugar)}>
      {posicao != null && (
        <div className={`card-lugar-posicao ${posicao < 3 ? 'podio' : ''}`}>
          {posicao === 0 ? '🥇' : posicao === 1 ? '🥈' : posicao === 2 ? '🥉' : `${posicao + 1}º`}
        </div>
      )}

      <span className="card-lugar-icone" aria-hidden="true">{infoTipo(lugar).icone}</span>

      <div className="card-lugar-corpo">
        <h3 className="card-lugar-nome">{lugar.nome}</h3>
        <div className="card-lugar-tags">
          <span className="tag-tipo">{infoTipo(lugar).label}</span>
          {(lugar.tags || []).slice(0, 2).map(tag => (
            <span key={tag} className="tag-pequena">{tag}</span>
          ))}
        </div>
        <div className="card-lugar-meta">
          <Estrelas nota={media} tamanho="sm" />
          <span className="card-lugar-nota">{media.toFixed(1)}</span>
          <span className="card-lugar-sep">·</span>
          <span>{total} {total === 1 ? 'avaliação' : 'avaliações'}</span>
          {distancia != null && (
            <>
              <span className="card-lugar-sep">·</span>
              <span className="card-lugar-distancia">📍 {formatarDistancia(distancia)}</span>
            </>
          )}
        </div>
      </div>

      {onToggleFavorito && (
        <button className={`btn-favorito-mini ${favorito ? 'ativo' : ''}`}
          aria-label={favorito ? 'Remover dos salvos' : 'Salvar lugar'}
          onClick={(e) => { e.stopPropagation(); onToggleFavorito(lugar.id); }}>
          {favorito ? '❤️' : '🤍'}
        </button>
      )}
    </article>
  );
}

// ============ INÍCIO ============
function HomePage({ lugares, carregando, favoritos, darkMode, onToggleDarkMode, onNavigate, onSelect, posicaoUsuario }) {
  const { usuario } = useAuth();
  const comAvaliacoes = lugares.filter(l => (l.avaliacoes || []).length > 0);
  const totalAvaliacoes = comAvaliacoes.reduce((s, l) => s + l.avaliacoes.length, 0);
  const mediaGlobal = comAvaliacoes.length
    ? comAvaliacoes.reduce((s, l) => s + calcularMedia(l), 0) / comAvaliacoes.length : 0;

  const tiposUsados = useMemo(() => {
    const s = new Set(lugares.map(tipoDe));
    return [...s];
  }, [lugares]);

  const destaque = useMemo(() => {
    if (!comAvaliacoes.length) return null;
    return [...comAvaliacoes].sort((a, b) => notaPonderada(b, mediaGlobal) - notaPonderada(a, mediaGlobal))[0];
  }, [comAvaliacoes, mediaGlobal]);

  const recentes = useMemo(() => [...comAvaliacoes]
    .sort((a, b) => {
      const ua = String(a.avaliacoes[a.avaliacoes.length - 1]?.id || '');
      const ub = String(b.avaliacoes[b.avaliacoes.length - 1]?.id || '');
      return ub.localeCompare(ua);
    })
    .slice(0, 4), [comAvaliacoes]);

  // Lugares cadastrados que ninguém avaliou ainda. Antes eles sumiam da tela
  // inicial, o que fazia o contador dizer "1 lugar" ao lado de "nenhum lugar".
  const semAvaliacao = useMemo(
    () => lugares.filter(l => !(l.avaliacoes || []).length),
    [lugares]
  );

  return (
    <div className="home-page">
      <header className="header">
        <div className="header-top">
          <div>
            <p className="eyebrow">Guia de dois</p>
            <h1 className="title">Roteiro Górdoras</h1>
          </div>
          <div className="header-acoes">
            <button className="btn-darkmode" onClick={onToggleDarkMode}
              aria-label={darkMode ? 'Ativar modo claro' : 'Ativar modo escuro'}>
              {darkMode ? '☀️' : '🌙'}
            </button>
            {usuario ? (
              <button className="btn-avatar" onClick={() => onNavigate('conta')} aria-label="Sua conta">
                {(usuario.displayName || usuario.email).charAt(0).toUpperCase()}
              </button>
            ) : (
              <button className="btn-chip" onClick={() => onNavigate('login')}>Entrar</button>
            )}
          </div>
        </div>
        <p className="subtitle">
          {usuario
            ? `Boas-vindas de volta, ${(usuario.displayName || '').split(' ')[0] || 'górdora'}.`
            : 'Restaurantes, bares, parques, hotéis — tudo que vale voltar.'}
        </p>
      </header>

      <div className="faixa-numeros">
        <div className="numero-item"><strong>{lugares.length}</strong><span>lugares</span></div>
        <div className="numero-item"><strong>{totalAvaliacoes}</strong><span>avaliações</span></div>
        <div className="numero-item"><strong>{mediaGlobal ? mediaGlobal.toFixed(1) : '—'}</strong><span>média geral</span></div>
      </div>

      <button className="btn-primary btn-busca-hero" onClick={() => onNavigate('busca')}>
        🔍 Buscar lugar
      </button>

      {tiposUsados.length > 1 && (
        <div className="tipos-resumo">
          {tiposUsados.map(t => (
            <span key={t} className="tipo-pilula">
              <span aria-hidden="true">{TIPOS[t].icone}</span> {TIPOS[t].label}
            </span>
          ))}
        </div>
      )}

      {carregando ? <Esqueleto linhas={2} /> : lugares.length === 0 ? (
        <Vazio icone="📍" titulo="Nenhum lugar ainda"
          texto="Cadastre o primeiro ponto do roteiro."
          acao={<button className="btn-primary" onClick={() => onNavigate('novo')}>Cadastrar lugar</button>} />
      ) : destaque ? (
        <section className="secao">
          <div className="secao-titulo">
            <h2>Melhor avaliado</h2>
            <button className="link-btn" onClick={() => onNavigate('ranking')}>Ver ranking</button>
          </div>
          <div className="destaque" onClick={() => onSelect(destaque)}>
            <div className="destaque-nota">
              <span className="destaque-numero">{calcularMedia(destaque).toFixed(1)}</span>
              <Estrelas nota={calcularMedia(destaque)} tamanho="sm" />
            </div>
            <div>
              <h3>{infoTipo(destaque).icone} {destaque.nome}</h3>
              <p>{[infoTipo(destaque).label, ...(destaque.tags || [])].join(' · ')}</p>
              <span className="destaque-contagem">{destaque.avaliacoes.length} avaliações</span>
            </div>
          </div>
        </section>
      ) : null}

      {recentes.length > 0 && (
        <section className="secao">
          <div className="secao-titulo"><h2>Avaliados recentemente</h2></div>
          <div className="lista-cards">
            {recentes.map(l => (
              <CardLugar key={l.id} lugar={l} onSelect={onSelect} favorito={favoritos.includes(l.id)}
                distancia={posicaoUsuario && l.latitude
                  ? distanciaKm(posicaoUsuario[0], posicaoUsuario[1], l.latitude, l.longitude) : null} />
            ))}
          </div>
        </section>
      )}

      {semAvaliacao.length > 0 && (
        <section className="secao">
          <div className="secao-titulo">
            <h2>Esperando a primeira resenha</h2>
            <span className="secao-contagem">{semAvaliacao.length}</span>
          </div>
          <div className="lista-cards">
            {semAvaliacao.map(l => (
              <CardLugar key={l.id} lugar={l} onSelect={onSelect} favorito={favoritos.includes(l.id)}
                distancia={posicaoUsuario && l.latitude
                  ? distanciaKm(posicaoUsuario[0], posicaoUsuario[1], l.latitude, l.longitude) : null} />
            ))}
          </div>
        </section>
      )}

      <div className="atalhos">
        <button className="atalho" onClick={() => onNavigate('favoritos')}>❤️ Salvos</button>
        <button className="atalho" onClick={() => onNavigate('stats')}>📊 Estatísticas</button>
        <button className="atalho" onClick={() => onNavigate('novo')}>➕ Novo lugar</button>
      </div>
    </div>
  );
}

// ============ MAPA ============
function RecentralizarMapa({ centro }) {
  const map = useMap();
  useEffect(() => {
    if (centro) map.flyTo(centro, 14, { duration: 0.8 });
  }, [centro, map]);
  return null;
}

function PaginaMapa({ lugares, favoritos, onVoltar, onSelectLugar, posicaoUsuario, onLocalizar }) {
  const [filtroTipo, setFiltroTipo] = useState('');
  const [centro, setCentro] = useState(null);

  const comCoordenadas = useMemo(
    () => lugares.filter(l => l.latitude && l.longitude),
    [lugares]
  );

  const contagens = useMemo(() => {
    const c = {};
    comCoordenadas.forEach(l => { const t = tipoDe(l); c[t] = (c[t] || 0) + 1; });
    return c;
  }, [comCoordenadas]);

  const visiveis = useMemo(() => {
    let lista = filtroTipo ? comCoordenadas.filter(l => tipoDe(l) === filtroTipo) : comCoordenadas;
    if (posicaoUsuario) {
      lista = [...lista]
        .map(l => ({ ...l, _d: distanciaKm(posicaoUsuario[0], posicaoUsuario[1], l.latitude, l.longitude) }))
        .sort((a, b) => a._d - b._d);
    }
    return lista;
  }, [comCoordenadas, filtroTipo, posicaoUsuario]);

  return (
    <div className="mapa-page">
      <Cabecalho titulo="Mapa" onVoltar={onVoltar}
        acao={<button className="btn-chip" onClick={() => onLocalizar().then(p => p && setCentro(p))}>📍 Onde estou</button>} />

      {comCoordenadas.length === 0 ? (
        <Vazio icone="🗺️" titulo="Mapa vazio" texto="Nenhum lugar tem localização cadastrada ainda." />
      ) : (
        <>
          <FiltroTipos valor={filtroTipo} onChange={setFiltroTipo} contagens={contagens} />

          <MapContainer center={posicaoUsuario || CENTRO_PADRAO} zoom={12} className="mapa-grande">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            <RecentralizarMapa centro={centro} />
            {posicaoUsuario && (
              <Marker position={posicaoUsuario}
                icon={L.divIcon({ className: 'pino-usuario', html: '<span></span>', iconSize: [18, 18] })}>
                <Popup>Você está aqui</Popup>
              </Marker>
            )}
            {visiveis.map(l => (
              <Marker key={l.id} position={[l.latitude, l.longitude]}
                icon={iconeDoLugar(l, favoritos.includes(l.id))}>
                <Popup>
                  <div className="popup-content">
                    <strong>{l.nome}</strong>
                    <p>{infoTipo(l).label} · ⭐ {calcularMedia(l).toFixed(1)} · {(l.avaliacoes || []).length} aval.</p>
                    <button className="btn-mini" onClick={() => onSelectLugar(l)}>Abrir</button>
                  </div>
                </Popup>
              </Marker>
            ))}
          </MapContainer>

          <div className="mapa-lista-resumo">
            <h3>{posicaoUsuario ? 'Mais perto de você' : 'No mapa'} ({visiveis.length})</h3>
            <div className="lista-cards">
              {visiveis.map(l => (
                <CardLugar key={l.id} lugar={l} onSelect={onSelectLugar}
                  favorito={favoritos.includes(l.id)} distancia={l._d} />
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ============ BUSCA ============
function TelaBusca({ lugares, favoritos, onToggleFavorito, onSelect, onNovoLugar, onVoltar, posicaoUsuario, onLocalizar }) {
  const [busca, setBusca] = useState('');
  const [buscaDebounced, setBuscaDebounced] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroTag, setFiltroTag] = useState('');
  const [ordem, setOrdem] = useState('nota');

  useEffect(() => {
    const t = setTimeout(() => setBuscaDebounced(busca), 250);
    return () => clearTimeout(t);
  }, [busca]);

  const contagens = useMemo(() => {
    const c = {};
    lugares.forEach(l => { const t = tipoDe(l); c[t] = (c[t] || 0) + 1; });
    return c;
  }, [lugares]);

  // As tags do filtro saem dos dados reais, não de uma lista fixa.
  const tagsDisponiveis = useMemo(() => {
    const s = new Set();
    lugares
      .filter(l => !filtroTipo || tipoDe(l) === filtroTipo)
      .forEach(l => (l.tags || []).forEach(t => s.add(t)));
    return [...s].sort((a, b) => a.localeCompare(b, 'pt-BR'));
  }, [lugares, filtroTipo]);

  useEffect(() => {
    if (filtroTag && !tagsDisponiveis.includes(filtroTag)) setFiltroTag('');
  }, [tagsDisponiveis, filtroTag]);

  const resultados = useMemo(() => {
    const alvo = normalizar(buscaDebounced);
    let lista = lugares.filter(l => {
      const nome = normalizar(l.nome);
      const tags = (l.tags || []).map(normalizar).join(' ');
      const rotuloTipo = normalizar(infoTipo(l).label);
      const casaTexto = !alvo || nome.includes(alvo) || tags.includes(alvo) || rotuloTipo.includes(alvo);
      const casaTipo = !filtroTipo || tipoDe(l) === filtroTipo;
      const casaTag = !filtroTag || (l.tags || []).includes(filtroTag);
      return casaTexto && casaTipo && casaTag;
    });

    if (posicaoUsuario) {
      lista = lista.map(l => ({
        ...l,
        _d: l.latitude ? distanciaKm(posicaoUsuario[0], posicaoUsuario[1], l.latitude, l.longitude) : null
      }));
    }

    const ordenadores = {
      nota: (a, b) => calcularMedia(b) - calcularMedia(a),
      avaliacoes: (a, b) => (b.avaliacoes || []).length - (a.avaliacoes || []).length,
      nome: (a, b) => a.nome.localeCompare(b.nome, 'pt-BR'),
      distancia: (a, b) => (a._d ?? Infinity) - (b._d ?? Infinity)
    };
    return [...lista].sort(ordenadores[ordem] || ordenadores.nota);
  }, [lugares, buscaDebounced, filtroTipo, filtroTag, ordem, posicaoUsuario]);

  return (
    <div className="busca-container">
      <Cabecalho titulo="Buscar" onVoltar={onVoltar} />

      <div className="busca-campo">
        <span className="busca-lupa" aria-hidden="true">🔍</span>
        <input type="search" className="busca-input" placeholder="Nome, tipo de lugar ou tag"
          value={busca} onChange={e => setBusca(e.target.value)} autoFocus />
        {busca && <button className="busca-limpar" onClick={() => setBusca('')} aria-label="Limpar busca">✕</button>}
      </div>

      <FiltroTipos valor={filtroTipo} onChange={setFiltroTipo} contagens={contagens} />

      {tagsDisponiveis.length > 0 && (
        <div className="filtro-tags" role="group" aria-label="Filtrar por tag">
          <button className={`tag-filtro ${!filtroTag ? 'ativo' : ''}`} onClick={() => setFiltroTag('')}>
            Todas as tags
          </button>
          {tagsDisponiveis.map(tag => (
            <button key={tag} className={`tag-filtro ${filtroTag === tag ? 'ativo' : ''}`}
              onClick={() => setFiltroTag(filtroTag === tag ? '' : tag)}>{tag}</button>
          ))}
        </div>
      )}

      <div className="barra-ordenacao">
        <label htmlFor="ordem">Ordenar por</label>
        <select id="ordem" value={ordem} onChange={e => setOrdem(e.target.value)}>
          <option value="nota">Melhor nota</option>
          <option value="avaliacoes">Mais avaliados</option>
          <option value="nome">Nome (A–Z)</option>
          <option value="distancia">Mais perto</option>
        </select>
        {ordem === 'distancia' && !posicaoUsuario && (
          <button className="btn-chip" onClick={onLocalizar}>📍 Usar minha localização</button>
        )}
        <span className="contagem-resultados">{resultados.length} resultado(s)</span>
      </div>

      <div className="lista-cards">
        {resultados.length === 0 ? (
          <Vazio icone="🧭" titulo="Nada encontrado"
            texto={busca ? `Nenhum lugar para "${busca}".` : 'Ajuste os filtros para ver resultados.'}
            acao={busca ? <button className="btn-primary" onClick={() => onNovoLugar(busca)}>Cadastrar "{busca}"</button> : null} />
        ) : (
          resultados.map(l => (
            <CardLugar key={l.id} lugar={l} onSelect={onSelect} favorito={favoritos.includes(l.id)}
              onToggleFavorito={onToggleFavorito} distancia={l._d} />
          ))
        )}
      </div>

      <button className="btn-secondary btn-bloco btn-margem" onClick={() => onNovoLugar(busca)}>
        ➕ Cadastrar novo lugar
      </button>
    </div>
  );
}

// ============ RANKING ============
function PaginaRanking({ lugares, favoritos, onToggleFavorito, onVoltar, onSelect }) {
  const [filtroTipo, setFiltroTipo] = useState('');
  const [minimo, setMinimo] = useState(1);

  const comAvaliacoes = useMemo(
    () => lugares.filter(l => (l.avaliacoes || []).length > 0),
    [lugares]
  );

  const contagens = useMemo(() => {
    const c = {};
    comAvaliacoes.forEach(l => { const t = tipoDe(l); c[t] = (c[t] || 0) + 1; });
    return c;
  }, [comAvaliacoes]);

  // A média global é calculada dentro do tipo filtrado: comparar a nota de um
  // parque com a de um restaurante distorceria o ranking dos dois.
  const ranked = useMemo(() => {
    const base = filtroTipo ? comAvaliacoes.filter(l => tipoDe(l) === filtroTipo) : comAvaliacoes;
    const mediaBase = base.length
      ? base.reduce((s, l) => s + calcularMedia(l), 0) / base.length : 0;
    return base
      .filter(l => l.avaliacoes.length >= minimo)
      .sort((a, b) => notaPonderada(b, mediaBase) - notaPonderada(a, mediaBase));
  }, [comAvaliacoes, filtroTipo, minimo]);

  return (
    <div className="ranking-container">
      <Cabecalho titulo="Ranking" onVoltar={onVoltar} />

      <p className="nota-metodo">
        A ordem usa nota ponderada: quanto mais avaliações, mais a nota do lugar pesa
        contra a média do grupo. Ao filtrar por tipo, a comparação acontece só dentro
        daquele tipo.
      </p>

      <FiltroTipos valor={filtroTipo} onChange={setFiltroTipo} contagens={contagens} />

      <div className="barra-ordenacao">
        <label htmlFor="minimo">Mínimo de avaliações</label>
        <select id="minimo" value={minimo} onChange={e => setMinimo(Number(e.target.value))}>
          <option value={1}>1+</option>
          <option value={2}>2+</option>
          <option value={3}>3+</option>
          <option value={5}>5+</option>
        </select>
      </div>

      <div className="lista-cards">
        {ranked.length === 0 ? (
          <Vazio icone="🏆" titulo="Ranking vazio" texto="Nenhum lugar atende a esses filtros." />
        ) : (
          ranked.map((l, idx) => (
            <CardLugar key={l.id} lugar={l} posicao={idx} onSelect={onSelect}
              favorito={favoritos.includes(l.id)} onToggleFavorito={onToggleFavorito} />
          ))
        )}
      </div>
    </div>
  );
}

// ============ FAVORITOS ============
function PaginaFavoritos({ lugares, favoritos, onToggleFavorito, onVoltar, onSelect, onNavigate }) {
  const lista = favoritos.map(id => lugares.find(l => l.id === id)).filter(Boolean);

  return (
    <div className="favoritos-page">
      <Cabecalho titulo="Salvos" onVoltar={onVoltar} />
      {lista.length === 0 ? (
        <Vazio icone="❤️" titulo="Nenhum lugar salvo"
          texto="Toque no coração de um lugar para guardá-lo aqui."
          acao={<button className="btn-primary" onClick={() => onNavigate('busca')}>Buscar lugares</button>} />
      ) : (
        <div className="lista-cards">
          {lista.map(l => (
            <CardLugar key={l.id} lugar={l} onSelect={onSelect} favorito onToggleFavorito={onToggleFavorito} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============ ESTATÍSTICAS ============
function PaginaEstatisticas({ lugares, favoritos, onVoltar }) {
  const toast = useToast();
  const comAvaliacoes = lugares.filter(l => (l.avaliacoes || []).length > 0);

  const mediaGeral = comAvaliacoes.length
    ? (comAvaliacoes.reduce((s, l) => s + calcularMedia(l), 0) / comAvaliacoes.length).toFixed(1) : '—';

  const totalAvaliacoes = comAvaliacoes.reduce((s, l) => s + l.avaliacoes.length, 0);

  const porAvaliador = useMemo(() => {
    const mapa = {};
    comAvaliacoes.forEach(l => l.avaliacoes.forEach(av => {
      const nome = av.avaliadorNome || 'Anônimo';
      if (!mapa[nome]) mapa[nome] = { n: 0, soma: 0, notas: 0 };
      mapa[nome].n += 1;
      (av.categorias || []).forEach(c => {
        if (typeof c.estrelas === 'number') { mapa[nome].soma += c.estrelas; mapa[nome].notas += 1; }
      });
    }));
    return Object.entries(mapa)
      .map(([nome, v]) => ({ nome, n: v.n, media: v.notas ? +(v.soma / v.notas).toFixed(1) : 0 }))
      .sort((a, b) => b.n - a.n);
  }, [comAvaliacoes]);

  const porTipo = useMemo(() => {
    const mapa = {};
    comAvaliacoes.forEach(l => {
      const t = tipoDe(l);
      if (!mapa[t]) mapa[t] = { n: 0, soma: 0 };
      mapa[t].n += 1;
      mapa[t].soma += calcularMedia(l);
    });
    return Object.entries(mapa)
      .map(([t, v]) => ({ tipo: t, n: v.n, media: +(v.soma / v.n).toFixed(1) }))
      .sort((a, b) => b.n - a.n);
  }, [comAvaliacoes]);

  const maxTipo = Math.max(1, ...porTipo.map(t => t.n));

  const exportar = () => {
    try {
      const blob = new Blob([JSON.stringify(lugares, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `roteiro-gordoras-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast('Backup baixado', 'ok');
    } catch {
      toast('Não foi possível gerar o arquivo', 'erro');
    }
  };

  return (
    <div className="stats-page">
      <Cabecalho titulo="Estatísticas" onVoltar={onVoltar}
        acao={<button className="btn-chip" onClick={exportar}>⬇ Backup</button>} />

      <div className="stats-grid">
        <div className="stat-box"><span className="stat-icon">📍</span>
          <div><div className="stat-valor">{comAvaliacoes.length}</div><div className="stat-titulo">Visitados</div></div></div>
        <div className="stat-box"><span className="stat-icon">⭐</span>
          <div><div className="stat-valor">{mediaGeral}</div><div className="stat-titulo">Média geral</div></div></div>
        <div className="stat-box"><span className="stat-icon">📝</span>
          <div><div className="stat-valor">{totalAvaliacoes}</div><div className="stat-titulo">Avaliações</div></div></div>
        <div className="stat-box"><span className="stat-icon">🗂️</span>
          <div><div className="stat-valor">{porTipo.length}</div><div className="stat-titulo">Tipos</div></div></div>
        <div className="stat-box"><span className="stat-icon">❤️</span>
          <div><div className="stat-valor">{favoritos.length}</div><div className="stat-titulo">Salvos</div></div></div>
      </div>

      {porTipo.length > 0 && (
        <section className="secao">
          <div className="secao-titulo"><h2>Por tipo de lugar</h2></div>
          <div className="grafico-tags">
            {porTipo.map(t => (
              <div key={t.tipo} className="grafico-linha">
                <span className="grafico-rotulo">{TIPOS[t.tipo].icone} {TIPOS[t.tipo].label}</span>
                <span className="grafico-trilho">
                  <span className="grafico-barra" style={{ width: `${(t.n / maxTipo) * 100}%` }} />
                </span>
                <span className="grafico-valor">{t.n} · ⭐{t.media}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      {porAvaliador.length > 0 && (
        <section className="secao">
          <div className="secao-titulo"><h2>Quem mais avalia</h2></div>
          <div className="tabela-stats">
            {porAvaliador.map((a, i) => (
              <div key={a.nome} className="tabela-row">
                <div className="tabela-cell medal">{i === 0 ? '👑' : `${i + 1}º`}</div>
                <div className="tabela-cell nome">{a.nome}</div>
                <div className="tabela-cell avaliacoes">{a.n} resenha(s)</div>
                <div className="tabela-cell media">⭐ {a.media}</div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

// ============ PÁGINA DO LUGAR ============
function PaginaLugar({ lugar, onVoltar, isFavorito, onToggleFavorito, onIrParaResenha,
                      onEditarLugar, onEditarResenha, onExcluido }) {
  const toast = useToast();
  const { usuario, podeExcluirLugar, podeExcluirResenha,
          podeEditarLugar, podeEditarResenha } = useAuth();
  const [confirmacao, setConfirmacao] = useState(null);
  const [ocupado, setOcupado] = useState(false);

  const media = calcularMedia(lugar);
  const categorias = mediaPorCategoria(lugar);
  const avaliacoes = [...(lugar.avaliacoes || [])].reverse();
  const tipo = infoTipo(lugar);

  // Datas ISO ordenam corretamente como texto, então basta pegar a maior.
  const ultimaVisita = useMemo(() => {
    const datas = (lugar.avaliacoes || []).map(a => a.dataVisita).filter(Boolean).sort();
    return datas.length ? formatarDataISO(datas[datas.length - 1]) : null;
  }, [lugar.avaliacoes]);

  const compartilhar = async () => {
    const texto = `${lugar.nome} — ⭐ ${media.toFixed(1)} no Roteiro Górdoras`;
    try {
      if (navigator.share) {
        await navigator.share({ title: lugar.nome, text: texto, url: window.location.href });
      } else {
        await navigator.clipboard.writeText(`${texto}\n${window.location.href}`);
        toast('Link copiado', 'ok');
      }
    } catch { /* cancelado */ }
  };

  const abrirNoMaps = () => {
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${lugar.latitude},${lugar.longitude}`,
      '_blank', 'noopener'
    );
  };

  const excluirLugar = async () => {
    setOcupado(true);
    try {
      await deleteDoc(doc(db, COLECAO, lugar.id));
      toast('Lugar excluído', 'ok');
      setConfirmacao(null);
      onExcluido();
    } catch (e) {
      console.error(e);
      toast('Sem permissão para excluir este lugar', 'erro');
    } finally {
      setOcupado(false);
    }
  };

  // Transação: remove só a resenha escolhida, sem sobrescrever o que outra
  // pessoa tenha publicado nesse meio-tempo.
  const excluirResenha = async (avaliacaoId) => {
    setOcupado(true);
    try {
      await runTransaction(db, async (tx) => {
        const ref = doc(db, COLECAO, lugar.id);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new Error('inexistente');
        const atuais = snap.data().avaliacoes || [];
        const alvo = atuais.find(a => a.id === avaliacaoId);
        if (!alvo) throw new Error('inexistente');
        if (!podeExcluirResenha(alvo)) throw new Error('permissao');
        tx.update(ref, { avaliacoes: atuais.filter(a => a.id !== avaliacaoId) });
      });
      toast('Resenha excluída', 'ok');
      setConfirmacao(null);
    } catch (e) {
      console.error(e);
      toast(e.message === 'permissao'
        ? 'Só quem escreveu pode excluir a resenha'
        : 'Não foi possível excluir a resenha', 'erro');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="pagina-lugar">
      <div className="lugar-hero">
        <button className="btn-back" onClick={onVoltar} aria-label="Voltar">←</button>
        <div className="lugar-hero-acoes">
          <button className="btn-icone" onClick={compartilhar} aria-label="Compartilhar">↗</button>
          <button className={`btn-icone ${isFavorito ? 'ativo' : ''}`} onClick={onToggleFavorito}
            aria-label={isFavorito ? 'Remover dos salvos' : 'Salvar'}>
            {isFavorito ? '❤️' : '🤍'}
          </button>
          {podeEditarLugar(lugar) && (
            <button className="btn-icone" aria-label="Editar cadastro"
              onClick={() => onEditarLugar(lugar)}>✏️</button>
          )}
          {podeExcluirLugar(lugar) && (
            <button className="btn-icone perigo" aria-label="Excluir lugar"
              onClick={() => setConfirmacao({ tipo: 'lugar' })}>🗑️</button>
          )}
        </div>

        <SeloTipo lugar={lugar} />
        <h1>{lugar.nome}</h1>

        <div className="lugar-hero-nota">
          <Estrelas nota={media} />
          <strong>{media.toFixed(1)}</strong>
          <span>· {(lugar.avaliacoes || []).length} avaliações</span>
        </div>

        <div className="tags">
          {(lugar.tags || []).map(tag => <span key={tag} className="tag">{tag}</span>)}
        </div>

        <p className="lugar-autoria">
          {ultimaVisita && <>Última visita em {ultimaVisita}</>}
          {ultimaVisita && lugar.criadoPorNome && ' · '}
          {lugar.criadoPorNome && <>Cadastrado por {lugar.criadoPorNome}</>}
        </p>
      </div>

      {categorias.length > 0 && (
        <section className="secao">
          <div className="secao-titulo"><h2>Média por categoria</h2></div>
          <div className="lista-barras">
            {categorias.map(c => <BarraCategoria key={c.name} item={c} />)}
          </div>
        </section>
      )}

      {lugar.latitude && lugar.longitude && (
        <section className="secao">
          <div className="secao-titulo">
            <h2>Localização</h2>
            <button className="link-btn" onClick={abrirNoMaps}>Abrir no Google Maps</button>
          </div>
          <div className="mapa-container-pequeno">
            <MapContainer center={[lugar.latitude, lugar.longitude]} zoom={15}
              className="mapa-pequeno" scrollWheelZoom={false}>
              <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
              <Marker position={[lugar.latitude, lugar.longitude]} icon={iconeDoLugar(lugar, isFavorito)}>
                <Popup>{lugar.nome}</Popup>
              </Marker>
            </MapContainer>
          </div>
        </section>
      )}

      <section className="secao">
        <div className="secao-titulo"><h2>Resenhas</h2></div>
        {avaliacoes.length === 0 ? (
          <Vazio icone="✍️" titulo="Ainda sem resenhas" texto={`Conte como foi a experiência neste ${tipo.label.toLowerCase()}.`} />
        ) : (
          avaliacoes.map((av, idx) => {
            const minha = !!usuario && av.uid === usuario.uid;
            const removivel = podeExcluirResenha(av);
            const editavel = podeEditarResenha(av);
            const visita = formatarDataISO(av.dataVisita);
            const mostrarEscrita = visita && av.data && visita !== av.data;
            return (
              <article key={av.id || idx} className={`avaliacao-card ${minha ? 'minha' : ''}`}>
                <div className="av-header">
                  <span className="av-avatar" aria-hidden="true">
                    {(av.avaliadorNome || '?').charAt(0).toUpperCase()}
                  </span>
                  <div className="av-identidade">
                    <strong>{av.avaliadorNome}{minha && <span className="selo-voce">você</span>}</strong>
                    <span className="av-data">
                      {visita ? `Visitou em ${visita}` : av.data}
                      {mostrarEscrita && (
                        <span className="av-data-secundaria"> · escrita em {av.data}</span>
                      )}
                      {av.editadaEm && (
                        <span className="av-data-secundaria"> · editada em {av.editadaEm}</span>
                      )}
                    </span>
                  </div>
                  <div className="av-acoes">
                    {editavel && (
                      <button className="btn-acao-resenha" aria-label="Editar resenha"
                        onClick={() => onEditarResenha(av)}>✏️</button>
                    )}
                    {removivel && (
                      <button className="btn-acao-resenha perigo" aria-label="Excluir resenha"
                        onClick={() => setConfirmacao({ tipo: 'resenha', alvo: av })}>🗑️</button>
                    )}
                  </div>
                </div>

                <div className="categorias-resumo">
                  {(av.categorias || []).map((cat, i) => (
                    <div key={i} className="categoria-badge" title={cat.observacao || ''}>
                      <span>{cat.icon} {cat.name}</span>
                      <Estrelas nota={cat.estrelas} tamanho="sm" />
                    </div>
                  ))}
                </div>

                {av.resenhageral && <p className="resenha-texto">{av.resenhageral}</p>}

                {(av.categorias || []).some(c => c.observacao) && (
                  <details className="detalhes-obs">
                    <summary>Observações por categoria</summary>
                    <ul>
                      {(av.categorias || []).filter(c => c.observacao).map((c, i) => (
                        <li key={i}><strong>{c.icon} {c.name}:</strong> {c.observacao}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </article>
            );
          })
        )}
      </section>

      <div className="barra-acao-fixa">
        <button className="btn-primary btn-bloco" onClick={onIrParaResenha}>✍️ Escrever resenha</button>
      </div>

      <Confirmacao
        aberto={confirmacao?.tipo === 'lugar'}
        titulo="Excluir lugar?"
        texto={`"${lugar.nome}" e as ${(lugar.avaliacoes || []).length} resenhas dele serão apagados para vocês dois. Não dá para desfazer.`}
        ocupado={ocupado}
        onConfirmar={excluirLugar}
        onCancelar={() => setConfirmacao(null)}
      />

      <Confirmacao
        aberto={confirmacao?.tipo === 'resenha'}
        titulo="Excluir resenha?"
        texto={`A resenha de ${confirmacao?.alvo?.avaliadorNome} será apagada. Não dá para desfazer.`}
        ocupado={ocupado}
        onConfirmar={() => excluirResenha(confirmacao.alvo.id)}
        onCancelar={() => setConfirmacao(null)}
      />
    </div>
  );
}

// ============ FORMULÁRIO DE RESENHA ============
function FormularioResenha({ lugar, avaliacaoExistente, onSave, onCancel }) {
  const toast = useToast();
  const { usuario, podeEditarResenha } = useAuth();
  const editando = !!avaliacaoExistente;

  // Categorias já usadas neste lugar, ou o conjunto padrão do tipo dele.
  const [categorias, setCategorias] = useState(() =>
    editando
      ? (avaliacaoExistente.categorias || []).map(c => ({ ...c }))
      : (lugar.categorias?.length ? lugar.categorias : infoTipo(lugar).categorias)
          .map(c => ({ name: c.name, icon: c.icon, estrelas: 3, observacao: '' }))
  );
  const [categoriaCustom, setCategoriaCustom] = useState('');
  const [iconCustom, setIconCustom] = useState('⭐');
  const [resenhageral, setResenhageral] = useState(avaliacaoExistente?.resenhageral || '');
  const [dataVisita, setDataVisita] = useState(() => avaliacaoExistente?.dataVisita || hojeISO());
  const [salvando, setSalvando] = useState(false);

  const jaAvaliei = !editando && (lugar.avaliacoes || []).some(av => av.uid === usuario?.uid);

  const adicionarCategoriaCustom = () => {
    const nome = categoriaCustom.trim();
    if (!nome) return;
    if (categorias.some(c => normalizar(c.name) === normalizar(nome))) {
      return toast('Essa categoria já está na lista', 'erro');
    }
    setCategorias([...categorias, { name: nome, icon: iconCustom || '⭐', estrelas: 3, observacao: '' }]);
    setCategoriaCustom('');
    setIconCustom('⭐');
  };

  const updateCategoria = (index, campo, valor) =>
    setCategorias(prev => prev.map((c, i) => (i === index ? { ...c, [campo]: valor } : c)));

  const removerCategoria = (index) => setCategorias(prev => prev.filter((_, i) => i !== index));

  const handleSalvar = async () => {
    if (!usuario) return toast('Entre na sua conta para publicar', 'erro');
    if (categorias.length === 0) return toast('Adicione pelo menos uma categoria', 'erro');
    if (!resenhageral.trim()) return toast('Escreva a resenha geral', 'erro');
    if (!dataVisita) return toast('Informe a data da visita', 'erro');
    if (dataVisita > hojeISO()) return toast('A visita não pode ser no futuro', 'erro');

    setSalvando(true);
    try {
      // Edição: troca o item da lista pelo id, dentro de uma transação, para
      // não desfazer uma resenha que a outra pessoa publicou nesse intervalo.
      if (editando) {
        await runTransaction(db, async (tx) => {
          const ref = doc(db, COLECAO, lugar.id);
          const snap = await tx.get(ref);
          if (!snap.exists()) throw new Error('inexistente');
          const atuais = snap.data().avaliacoes || [];
          const idx = atuais.findIndex(a => a.id === avaliacaoExistente.id);
          if (idx === -1) throw new Error('inexistente');
          if (!podeEditarResenha(atuais[idx])) throw new Error('permissao');
          const copia = [...atuais];
          copia[idx] = {
            ...atuais[idx],
            categorias,
            resenhageral: resenhageral.trim(),
            dataVisita,
            editadaEm: new Date().toLocaleDateString('pt-BR')
          };
          tx.update(ref, { avaliacoes: copia, atualizadoEm: serverTimestamp() });
        });
        toast('Resenha atualizada', 'ok');
        onSave();
        return;
      }

      const novaAvaliacao = {
        uid: usuario.uid,
        avaliadorNome: usuario.displayName || usuario.email,
        categorias,
        resenhageral: resenhageral.trim(),
        dataVisita,                                    // quando esteve no lugar
        data: new Date().toLocaleDateString('pt-BR'),  // quando escreveu
        id: `${usuario.uid}-${Date.now()}`
      };

      const catsAtuais = lugar.categorias || infoTipo(lugar).categorias;
      const conhecidas = new Set(catsAtuais.map(c => c.name));
      const novasCats = categorias
        .filter(c => !conhecidas.has(c.name))
        .map(c => ({ name: c.name, icon: c.icon }));

      await updateDoc(doc(db, COLECAO, lugar.id), {
        avaliacoes: arrayUnion(novaAvaliacao),
        categorias: [...catsAtuais.map(c => ({ name: c.name, icon: c.icon })), ...novasCats],
        atualizadoEm: serverTimestamp()
      });

      toast('Resenha publicada', 'ok');
      onSave();
    } catch (e) {
      console.error(e);
      toast(e.message === 'permissao'
        ? 'Só quem escreveu pode editar a resenha'
        : 'Não foi possível salvar. Verifique a conexão.', 'erro');
    } finally {
      setSalvando(false);
    }
  };

  return (
    <div className="form-container">
      <Cabecalho titulo={editando ? 'Editar resenha' : `Avaliando ${lugar.nome}`} onVoltar={onCancel} />

      <p className="subtitle-form">
        {infoTipo(lugar).icone} {editando ? lugar.nome : infoTipo(lugar).label} · assinando como{' '}
        <strong>{usuario?.displayName || usuario?.email}</strong>.
        {jaAvaliei && ' Você já avaliou este lugar — esta será uma segunda resenha.'}
      </p>

      <div className="secao-categorias">
        {categorias.map((cat, idx) => (
          <div key={`${cat.name}-${idx}`} className="categoria-avaliacao">
            <div className="categoria-header">
              <span className="categoria-titulo">{cat.icon} {cat.name}</span>
              {categorias.length > 1 && (
                <button className="btn-remover-pequeno" onClick={() => removerCategoria(idx)}
                  aria-label={`Remover ${cat.name}`}>✕</button>
              )}
            </div>
            <SeletorEstrelas rotulo={`Nota para ${cat.name}`} valor={cat.estrelas}
              onChange={(n) => updateCategoria(idx, 'estrelas', n)} />
            <textarea value={cat.observacao} onChange={e => updateCategoria(idx, 'observacao', e.target.value)}
              placeholder={`O que achou de ${cat.name.toLowerCase()}? (opcional)`} className="textarea-observacao" />
          </div>
        ))}

        <div className="adicionar-categoria">
          <h4>Adicionar categoria</h4>
          <div className="custom-cat-input">
            <input type="text" value={iconCustom} onChange={e => setIconCustom(e.target.value)}
              placeholder="⭐" maxLength="2" className="input-emoji" aria-label="Emoji da categoria" />
            <input type="text" value={categoriaCustom} onChange={e => setCategoriaCustom(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && adicionarCategoriaCustom()}
              placeholder="Ex: Estacionamento" aria-label="Nome da categoria" />
            <button className="btn-secondary" onClick={adicionarCategoriaCustom}>Adicionar</button>
          </div>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="data-visita">Quando você foi?</label>
        <input
          id="data-visita"
          type="date"
          className="input-data"
          value={dataVisita}
          max={hojeISO()}
          onChange={e => setDataVisita(e.target.value)}
        />
        <p className="hint hint-data">
          Vem preenchido com hoje. Ajuste se a visita foi em outro dia.
        </p>
      </div>

      <div className="form-group">
        <label htmlFor="resenha">Resenha geral</label>
        <textarea id="resenha" value={resenhageral} onChange={e => setResenhageral(e.target.value)}
          placeholder="Como foi? Voltaria?" className="textarea-resenha" />
        <span className="contador">{resenhageral.length} caracteres</span>
      </div>

      <div className="form-buttons">
        <button className="btn-primary" onClick={handleSalvar} disabled={salvando}>
          {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Publicar resenha'}
        </button>
        <button className="btn-secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

// ============ SELETOR DE PONTO NO MAPA ============
function SeletorPonto({ posicao, onChange }) {
  useMapEvents({
    click(e) { onChange([+e.latlng.lat.toFixed(6), +e.latlng.lng.toFixed(6)]); }
  });
  return posicao ? (
    <Marker position={posicao} draggable eventHandlers={{
      dragend: (e) => {
        const { lat, lng } = e.target.getLatLng();
        onChange([+lat.toFixed(6), +lng.toFixed(6)]);
      }
    }} />
  ) : null;
}

// ============ CADASTRO DE LUGAR (novo ou edição) ============
function FormularioLugar({ lugarExistente, nomePreliminar, onSave, onCancel, posicaoUsuario, onLocalizar }) {
  const toast = useToast();
  const { usuario } = useAuth();
  const editando = !!lugarExistente;
  const [nome, setNome] = useState(lugarExistente?.nome || nomePreliminar || '');
  const [tipo, setTipo] = useState(() => (editando ? tipoDe(lugarExistente) : 'restaurante'));
  const [tagsEscolhidas, setTagsEscolhidas] = useState(lugarExistente?.tags || []);
  const [tagCustom, setTagCustom] = useState('');
  const [posicao, setPosicao] = useState(() =>
    lugarExistente?.latitude ? [lugarExistente.latitude, lugarExistente.longitude] : null);
  const [enderecoBusca, setEnderecoBusca] = useState(lugarExistente?.endereco || '');
  const [sugestoes, setSugestoes] = useState([]);
  const [buscandoEndereco, setBuscandoEndereco] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [centro, setCentro] = useState(null);
  const abortRef = useRef(null);

  // Trocar o tipo limpa só as tags sugeridas do tipo antigo; as digitadas ficam.
  const trocarTipo = (novo) => {
    setTagsEscolhidas(prev => prev.filter(t => !TIPOS[tipo].tags.includes(t)));
    setTipo(novo);
  };

  const toggleTag = (tag) =>
    setTagsEscolhidas(prev => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag]);

  const adicionarTagCustom = () => {
    const t = tagCustom.trim();
    if (!t) return;
    if (tagsEscolhidas.some(x => normalizar(x) === normalizar(t))) {
      return toast('Essa tag já está na lista', 'erro');
    }
    setTagsEscolhidas([...tagsEscolhidas, t]);
    setTagCustom('');
  };

  const buscarEndereco = async () => {
    const termo = enderecoBusca.trim();
    if (termo.length < 3) return toast('Digite ao menos 3 caracteres', 'erro');

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setBuscandoEndereco(true);
    try {
      const url = 'https://nominatim.openstreetmap.org/search'
        + `?format=json&limit=5&countrycodes=br&addressdetails=1&q=${encodeURIComponent(termo)}`;
      const resp = await fetch(url, { signal: abortRef.current.signal, headers: { 'Accept-Language': 'pt-BR' } });
      const dados = await resp.json();
      setSugestoes(dados);
      if (!dados.length) toast('Endereço não encontrado. Tente marcar no mapa.', 'erro');
    } catch (e) {
      if (e.name !== 'AbortError') toast('Busca de endereço indisponível agora', 'erro');
    } finally {
      setBuscandoEndereco(false);
    }
  };

  const escolherSugestao = (s) => {
    const p = [parseFloat(s.lat), parseFloat(s.lon)];
    setPosicao(p);
    setCentro(p);
    setSugestoes([]);
    setEnderecoBusca(s.display_name);
  };

  const usarMinhaLocalizacao = async () => {
    const p = await onLocalizar();
    if (p) { setPosicao(p); setCentro(p); }
  };

  const handleSave = async () => {
    if (!usuario) return toast('Entre na sua conta para cadastrar', 'erro');
    if (!nome.trim()) return toast('Dê um nome ao lugar', 'erro');
    if (!posicao) return toast('Marque a localização no mapa', 'erro');

    setSalvando(true);
    try {
      if (editando) {
        // As categorias de avaliação não são tocadas: as resenhas já
        // existentes dependem delas, mesmo que o tipo mude.
        await updateDoc(doc(db, COLECAO, lugarExistente.id), {
          nome: nome.trim(),
          tipo,
          tags: tagsEscolhidas,
          latitude: posicao[0],
          longitude: posicao[1],
          endereco: enderecoBusca.trim() || null,
          atualizadoEm: serverTimestamp()
        });
        toast('Cadastro atualizado', 'ok');
        onSave();
        return;
      }

      await addDoc(collection(db, COLECAO), {
        nome: nome.trim(),
        tipo,
        tags: tagsEscolhidas,
        latitude: posicao[0],
        longitude: posicao[1],
        endereco: enderecoBusca.trim() || null,
        criadoPor: usuario.uid,
        criadoPorNome: usuario.displayName || usuario.email,
        criadoEm: new Date().toLocaleDateString('pt-BR'),
        criadoTimestamp: serverTimestamp(),
        avaliacoes: [],
        categorias: TIPOS[tipo].categorias
      });
      toast('Lugar cadastrado', 'ok');
      onSave();
    } catch (e) {
      console.error(e);
      toast(editando
        ? 'Sem permissão para editar este cadastro'
        : 'Não foi possível salvar o lugar', 'erro');
    } finally {
      setSalvando(false);
    }
  };

  const tagsSugeridas = TIPOS[tipo].tags;
  const tagsExtras = tagsEscolhidas.filter(t => !tagsSugeridas.includes(t));

  return (
    <div className="form-container">
      <Cabecalho titulo={editando ? 'Editar cadastro' : 'Novo lugar'} onVoltar={onCancel} />

      <div className="form-group">
        <label>Que tipo de lugar é?</label>
        <div className="grade-tipos">
          {LISTA_TIPOS.map(t => (
            <button key={t} className={`cartao-tipo ${tipo === t ? 'ativo' : ''}`}
              onClick={() => trocarTipo(t)} aria-pressed={tipo === t}>
              <span className="cartao-tipo-icone" aria-hidden="true">{TIPOS[t].icone}</span>
              <span className="cartao-tipo-label">{TIPOS[t].label}</span>
            </button>
          ))}
        </div>
        <p className="hint">
          {editando && (lugarExistente.avaliacoes || []).length > 0
            ? 'Trocar o tipo não mexe nas categorias das resenhas já publicadas — elas continuam como estão.'
            : 'As categorias de avaliação mudam conforme o tipo — um hotel recebe nota de quarto e café da manhã, um parque recebe de paisagem e estrutura.'}
        </p>
      </div>

      <div className="form-group">
        <label htmlFor="nome-lugar">Nome</label>
        <input id="nome-lugar" type="text" value={nome} onChange={e => setNome(e.target.value)}
          placeholder={`Ex: ${tipo === 'restaurante' ? 'Churrascaria do Bairro' : TIPOS[tipo].label}`} />
      </div>

      <div className="form-group">
        <label>Tags (opcional)</label>
        <div className="tags-selector">
          {tagsSugeridas.map(tag => (
            <button key={tag} className={`tag-btn ${tagsEscolhidas.includes(tag) ? 'active' : ''}`}
              onClick={() => toggleTag(tag)} aria-pressed={tagsEscolhidas.includes(tag)}>{tag}</button>
          ))}
          {tagsExtras.map(tag => (
            <button key={tag} className="tag-btn active" onClick={() => toggleTag(tag)}
              aria-pressed="true">{tag} ✕</button>
          ))}
        </div>
        <div className="custom-cat-input tag-custom">
          <input type="text" value={tagCustom} onChange={e => setTagCustom(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && adicionarTagCustom()}
            placeholder="Criar outra tag" aria-label="Nova tag" />
          <button className="btn-secondary" onClick={adicionarTagCustom}>Adicionar</button>
        </div>
      </div>

      <div className="form-group">
        <label htmlFor="endereco">Localização</label>
        <p className="hint">Busque o endereço, use sua localização atual ou toque direto no mapa.</p>

        <div className="busca-endereco">
          <input id="endereco" type="text" value={enderecoBusca}
            onChange={e => setEnderecoBusca(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && buscarEndereco()}
            placeholder="Rua, número, cidade" />
          <button className="btn-secondary" onClick={buscarEndereco} disabled={buscandoEndereco}>
            {buscandoEndereco ? '…' : 'Buscar'}
          </button>
        </div>

        <button className="btn-chip" onClick={usarMinhaLocalizacao}>📍 Usar minha localização</button>

        {sugestoes.length > 0 && (
          <ul className="sugestoes">
            {sugestoes.map(s => (
              <li key={s.place_id}><button onClick={() => escolherSugestao(s)}>{s.display_name}</button></li>
            ))}
          </ul>
        )}

        <div className="mapa-container-pequeno">
          <MapContainer center={posicao || posicaoUsuario || CENTRO_PADRAO} zoom={13} className="mapa-pequeno">
            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution="&copy; OpenStreetMap" />
            <RecentralizarMapa centro={centro} />
            <SeletorPonto posicao={posicao} onChange={setPosicao} />
          </MapContainer>
        </div>

        <p className={`status-coord ${posicao ? 'ok' : ''}`}>
          {posicao
            ? `Marcado em ${posicao[0].toFixed(5)}, ${posicao[1].toFixed(5)} — arraste o pino para ajustar.`
            : 'Nenhum ponto marcado ainda.'}
        </p>
      </div>

      <div className="form-buttons">
        <button className="btn-primary" onClick={handleSave} disabled={salvando}>
          {salvando ? 'Salvando…' : editando ? 'Salvar alterações' : 'Cadastrar lugar'}
        </button>
        <button className="btn-secondary" onClick={onCancel}>Cancelar</button>
      </div>
    </div>
  );
}

// ============ CONTATO ============
function PaginaContato({ onVoltar }) {
  const toast = useToast();
  const { usuario } = useAuth();
  const [nome, setNome] = useState(usuario?.displayName || '');
  const [email, setEmail] = useState(usuario?.email || '');
  const [motivo, setMotivo] = useState('feedback');
  const [mensagem, setMensagem] = useState('');
  const [enviando, setEnviando] = useState(false);

  const handleEnviar = async () => {
    if (!nome.trim() || !email.trim() || !mensagem.trim()) {
      return toast('Preencha nome, e-mail e mensagem', 'erro');
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast('E-mail inválido', 'erro');

    setEnviando(true);
    try {
      await addDoc(collection(db, 'contatos'), {
        nome: nome.trim(), email: email.trim(), motivo, mensagem: mensagem.trim(),
        uid: usuario?.uid || null,
        data: new Date().toLocaleDateString('pt-BR'), timestamp: serverTimestamp()
      });
      toast('Mensagem enviada', 'ok');
      onVoltar();
    } catch (e) {
      console.error(e);
      toast('Não foi possível enviar agora', 'erro');
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="form-container">
      <Cabecalho titulo="Contato" onVoltar={onVoltar} />
      <p className="subtitle-form">Sugestões, problemas ou pedidos de remoção.</p>

      <div className="form-group">
        <label htmlFor="c-nome">Seu nome</label>
        <input id="c-nome" type="text" value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome completo" />
      </div>

      <div className="form-group">
        <label htmlFor="c-email">E-mail</label>
        <input id="c-email" type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="seu@email.com" />
      </div>

      <div className="form-group">
        <label htmlFor="c-motivo">Motivo</label>
        <select id="c-motivo" value={motivo} onChange={e => setMotivo(e.target.value)}>
          <option value="feedback">Dar feedback</option>
          <option value="deletar">Remover um lugar do app</option>
          <option value="problema">Reportar um problema</option>
          <option value="outro">Outro</option>
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="c-msg">Mensagem</label>
        <textarea id="c-msg" value={mensagem} onChange={e => setMensagem(e.target.value)}
          placeholder="Conte o que aconteceu" className="textarea-resenha" />
      </div>

      <div className="form-buttons">
        <button className="btn-primary" onClick={handleEnviar} disabled={enviando}>
          {enviando ? 'Enviando…' : 'Enviar mensagem'}
        </button>
        <button className="btn-secondary" onClick={onVoltar}>Cancelar</button>
      </div>
    </div>
  );
}

// ============ NAVEGAÇÃO INFERIOR ============
function NavInferior({ atual, onNavigate }) {
  return (
    <nav className="nav-inferior" aria-label="Navegação principal">
      {NAV.map(item => (
        <button key={item.id} className={`nav-item ${atual === item.id ? 'ativo' : ''}`}
          onClick={() => onNavigate(item.id)} aria-current={atual === item.id ? 'page' : undefined}>
          <span className="nav-icone" aria-hidden="true">{item.icon}</span>
          <span className="nav-label">{item.label}</span>
        </button>
      ))}
    </nav>
  );
}

// ============ APP ============
function AppInterno() {
  const toast = useToast();
  const { usuario, carregandoAuth } = useAuth();
  const [page, setPage] = useState('home');
  // A pilha de navegação nunca é exibida, então vive num ref: guardá-la em
  // estado causava um render extra a cada troca de tela sem nenhum ganho.
  const pilhaRef = useRef([]);
  const [lugares, setLugares] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [idSelecionado, setIdSelecionado] = useState(null);
  const [nomePreliminar, setNomePreliminar] = useState('');
  const [resenhaEmEdicao, setResenhaEmEdicao] = useState(null);
  const [motivoLogin, setMotivoLogin] = useState('');
  const [posicaoUsuario, setPosicaoUsuario] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);

  const [darkMode, setDarkMode] = useState(() => {
    const salvo = lerLocal('darkMode', null);
    if (salvo !== null) return salvo;
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  });
  const [favoritos, setFavoritos] = useState(() => lerLocal('favoritos', []));

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', darkMode ? 'dark' : 'light');
    localStorage.setItem('darkMode', JSON.stringify(darkMode));
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('favoritos', JSON.stringify(favoritos));
  }, [favoritos]);

  useEffect(() => {
    if (carregandoAuth) return;
    if (EXIGIR_LOGIN_PARA_VER && !usuario) {
      setLugares([]);
      setCarregando(false);
      return;
    }
    const cancelar = onSnapshot(
      collection(db, COLECAO),
      snap => {
        setLugares(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        setCarregando(false);
      },
      erro => {
        console.error(erro);
        setCarregando(false);
        toast('Não foi possível carregar os lugares', 'erro');
      }
    );
    return cancelar;
  }, [usuario, carregandoAuth, toast]);

  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => { window.removeEventListener('online', on); window.removeEventListener('offline', off); };
  }, []);

  const localizar = useCallback(() => new Promise(resolve => {
    if (!navigator.geolocation) {
      toast('Seu navegador não permite localização', 'erro');
      return resolve(null);
    }
    navigator.geolocation.getCurrentPosition(
      pos => { const p = [pos.coords.latitude, pos.coords.longitude]; setPosicaoUsuario(p); resolve(p); },
      () => { toast('Permissão de localização negada', 'erro'); resolve(null); },
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }), [toast]);

  const navegar = useCallback((destino) => {
    pilhaRef.current = [...pilhaRef.current, page];
    setPage(destino);
    window.scrollTo({ top: 0 });
  }, [page]);

  const voltar = useCallback(() => {
    const anterior = pilhaRef.current.pop() || 'home';
    setPage(anterior);
    window.scrollTo({ top: 0 });
  }, []);

  const irParaNav = (destino) => {
    pilhaRef.current = [];
    setPage(destino);
    window.scrollTo({ top: 0 });
  };

  const exigirLogin = useCallback((destino, motivo) => {
    if (usuario) { navegar(destino); return; }
    setMotivoLogin(motivo);
    navegar('login');
  }, [usuario, navegar]);

  const selecionar = (l) => { setIdSelecionado(l.id); navegar('lugar'); };

  const novoLugar = (nome = '') => {
    setNomePreliminar(nome);
    exigirLogin('novo', 'Entre para cadastrar um lugar novo.');
  };

  const editarLugar = () => navegar('editarLugar');

  const editarResenha = (avaliacao) => {
    setResenhaEmEdicao(avaliacao);
    navegar('editarResenha');
  };

  const toggleFavorito = (id) =>
    setFavoritos(prev => prev.includes(id) ? prev.filter(f => f !== id) : [id, ...prev]);

  const selecionado = lugares.find(l => l.id === idSelecionado) || null;
  const abaAtiva = NAV.some(n => n.id === page) ? page : null;

  if (carregandoAuth) return <div className="app"><Esqueleto linhas={3} /></div>;

  if (EXIGIR_LOGIN_PARA_VER && !usuario) {
    return (
      <div className="app">
        <PaginaLogin onSucesso={() => setPage('home')}
          motivo="Este roteiro é privado. Entre com sua conta para continuar." />
      </div>
    );
  }

  return (
    <div className="app">
      {!online && <div className="aviso-offline">Você está offline. As alterações não serão salvas.</div>}

      <main className="conteudo">
        {page === 'home' && (
          <HomePage lugares={lugares} carregando={carregando} favoritos={favoritos}
            darkMode={darkMode} onToggleDarkMode={() => setDarkMode(d => !d)}
            onNavigate={navegar} onSelect={selecionar} posicaoUsuario={posicaoUsuario} />
        )}

        {page === 'login' && <PaginaLogin onVoltar={voltar} onSucesso={voltar} motivo={motivoLogin} />}

        {page === 'conta' && (
          <PaginaConta lugares={lugares} favoritos={favoritos} onVoltar={voltar}
            onNavigate={navegar} onSelect={selecionar} />
        )}

        {page === 'busca' && (
          <TelaBusca lugares={lugares} favoritos={favoritos} onToggleFavorito={toggleFavorito}
            onSelect={selecionar} onNovoLugar={novoLugar} onVoltar={voltar}
            posicaoUsuario={posicaoUsuario} onLocalizar={localizar} />
        )}

        {page === 'mapa' && (
          <PaginaMapa lugares={lugares} favoritos={favoritos} onVoltar={voltar}
            onSelectLugar={selecionar} posicaoUsuario={posicaoUsuario} onLocalizar={localizar} />
        )}

        {page === 'ranking' && (
          <PaginaRanking lugares={lugares} favoritos={favoritos} onToggleFavorito={toggleFavorito}
            onVoltar={voltar} onSelect={selecionar} />
        )}

        {page === 'favoritos' && (
          <PaginaFavoritos lugares={lugares} favoritos={favoritos} onToggleFavorito={toggleFavorito}
            onVoltar={voltar} onSelect={selecionar} onNavigate={navegar} />
        )}

        {page === 'stats' && (
          <PaginaEstatisticas lugares={lugares} favoritos={favoritos} onVoltar={voltar} />
        )}

        {page === 'lugar' && selecionado && (
          <PaginaLugar lugar={selecionado} onVoltar={voltar}
            isFavorito={favoritos.includes(selecionado.id)}
            onToggleFavorito={() => toggleFavorito(selecionado.id)}
            onIrParaResenha={() => exigirLogin('resenha', 'Entre para publicar sua resenha.')}
            onEditarLugar={editarLugar}
            onEditarResenha={editarResenha}
            onExcluido={() => { setIdSelecionado(null); irParaNav('home'); }} />
        )}

        {page === 'resenha' && selecionado && (
          <FormularioResenha lugar={selecionado} onSave={voltar} onCancel={voltar} />
        )}

        {page === 'editarResenha' && selecionado && resenhaEmEdicao && (
          <FormularioResenha lugar={selecionado} avaliacaoExistente={resenhaEmEdicao}
            onSave={voltar} onCancel={voltar} />
        )}

        {page === 'novo' && (
          <FormularioLugar nomePreliminar={nomePreliminar} onSave={voltar} onCancel={voltar}
            posicaoUsuario={posicaoUsuario} onLocalizar={localizar} />
        )}

        {page === 'editarLugar' && selecionado && (
          <FormularioLugar lugarExistente={selecionado} onSave={voltar} onCancel={voltar}
            posicaoUsuario={posicaoUsuario} onLocalizar={localizar} />
        )}

        {page === 'contato' && <PaginaContato onVoltar={voltar} />}
      </main>

      <NavInferior atual={abaAtiva} onNavigate={irParaNav} />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <AuthProvider>
        <AppInterno />
      </AuthProvider>
    </ToastProvider>
  );
}