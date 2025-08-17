/* =========================
   Config & Auth (API + JWT)
========================= */
const API_BASE = 'https://bricksy-backend.onrender.com';

// --- almacenamiento local coherente ---
function setToken(t){ localStorage.setItem('bricksy_token', t); }
function getToken(){ return localStorage.getItem('bricksy_token'); }
function clearToken(){ localStorage.removeItem('bricksy_token'); }

function setAuth(user){ localStorage.setItem('bricksy_auth', JSON.stringify(user)); }
function getAuth(){ try { return JSON.parse(localStorage.getItem('bricksy_auth')||'null'); } catch(e){ return null; } }
function clearAuth(){ localStorage.removeItem('bricksy_auth'); }

// guardar ambos de una vez tras login/registro
function saveAuth({ token, user }){ setToken(token); setAuth(user); }

// --- cliente API simple (JSON) ---
async function api(path, { method='GET', data=null, auth=true } = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (auth) {
    const t = getToken();
    if (t) headers['Authorization'] = `Bearer ${t}`;
  }
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: data ? JSON.stringify(data) : null
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw out;
  return out;
}

// atajos
const apiRegister = (payload)=> api('/api/register', { method:'POST', data: payload, auth:false });
const apiLogin    = (payload)=> api('/api/login',    { method:'POST', data: payload, auth:false });
const apiMe       = ()=> api('/api/me', { method:'GET', auth:true });

/* =========================
   UI: Header según sesión
========================= */
function renderAuthUI(){
  const auth = getAuth();
  const loggedInEls = document.querySelectorAll('.logged-in');
  const loggedOutEls = document.querySelectorAll('.logged-out');
  const slot = document.querySelector('.avatar-slot');

  if(auth){
    loggedInEls.forEach(el => el && (el.style.display='inline-block'));
    loggedOutEls.forEach(el => el && (el.style.display='none'));

    // Ocultar enlaces/botones de registro si hay sesión
    document.getElementById('nav-register')?.remove();
    document.getElementById('cta-register')?.remove();

    if(slot){
      slot.innerHTML='';
      const wrap=document.createElement('div'); wrap.style.position='relative';
      const btn=document.createElement('button');
      btn.type='button';
      btn.setAttribute('aria-label','Abrir menú de usuario');
      btn.style.cssText='width:40px;height:40px;border-radius:50%;border:none;cursor:pointer';
      const initials=((auth.nombre||'U').split(/\s+/).map(w=>w[0]).slice(0,2).join('')||'U').toUpperCase();
      btn.textContent=initials;

      const menu=document.createElement('div');
      menu.style.cssText='position:absolute;right:0;top:44px;background:#fff;color:#222;border:1px solid #ddd;border-radius:10px;min-width:200px;box-shadow:0 8px 30px rgba(0,0,0,.1);padding:8px;display:none;z-index:10';
      menu.innerHTML = `
        <div style="padding:10px 8px;font-weight:600">¡Hola, ${auth.nombre||'usuario'}!</div>
        <a href="panel.html" style="display:block;padding:8px;border-radius:8px;text-decoration:none">Mi cuenta</a>
        <button type="button" id="logout-btn" style="display:block;width:100%;padding:10px 12px;margin-top:8px;border:none;border-radius:9999px;background:#0f5132;color:#fff;font-weight:600;cursor:pointer">Cerrar sesión</button>
      `;
      wrap.appendChild(btn); wrap.appendChild(menu); slot.appendChild(wrap);
      btn.addEventListener('click',()=>{ menu.style.display = (menu.style.display==='block'?'none':'block'); });
      document.addEventListener('click',(e)=>{ if(!wrap.contains(e.target)) menu.style.display='none'; });
      const logoutBtn = menu.querySelector('#logout-btn');
      logoutBtn.addEventListener('click', ()=>{
        clearToken(); clearAuth(); window.location.href='index.html';
      });
      logoutBtn.addEventListener('mouseenter', ()=>{ logoutBtn.style.background = '#0c3f27'; });
      logoutBtn.addEventListener('mouseleave', ()=>{ logoutBtn.style.background = '#0f5132'; });
    }
  } else {
    loggedInEls.forEach(el => el && (el.style.display='none'));
    loggedOutEls.forEach(el => el && (el.style.display='inline-block'));
    if(slot) slot.innerHTML='';
  }

  // Toggle menú móvil
  const btn = document.getElementById('nav-toggle');
  if(btn){
    btn.addEventListener('click',()=>{
      const nav = document.querySelector('header nav');
      if(nav) nav.classList.toggle('show');
    });
  }
}

/* =========================
   Guards: páginas privadas y CTAs
========================= */
function guardPrivatePages(){
  const privates = ['panel.html','crear_grupo.html','grupo_creado.html'];
  const path = (location.pathname.split('/').pop()||'index.html').toLowerCase();
  if(privates.includes(path) && !getAuth()){
    alert('Debes iniciar sesión para acceder.');
    window.location.href='login.html';
  }
}
function guardCTAs(){
  document.querySelectorAll('[data-require-auth]').forEach(el=>{
    el.addEventListener('click',(e)=>{
      if(!getAuth()){
        e.preventDefault();
        alert('Debes iniciar sesión o registrarte para continuar.');
        window.location.href='login.html';
      }
    });
  });
}

/* =========================
   Helpers UI
========================= */
function maskDateInput(input){
  if(!input) return;
  input.addEventListener('input', ()=>{
    let v = input.value.replace(/[^\d]/g,'').slice(0,8);
    if(v.length>=5) v = v.replace(/^(\d{2})(\d{2})(\d+)/,'$1/$2/$3');
    else if(v.length>=3) v = v.replace(/^(\d{2})(\d+)/,'$1/$2');
    input.value = v;
  });
}
function readFileAsDataURL(file){
  return new Promise((res,rej)=>{
    const fr = new FileReader();
    fr.onload=()=>res(fr.result);
    fr.onerror=rej;
    fr.readAsDataURL(file);
  });
}
function formatMoney(n){
  if(n===null || n===undefined || isNaN(n)) return '-';
  return Number(n).toLocaleString('es-ES',{ style:'currency', currency:'EUR', maximumFractionDigits:0 });
}

/* =========================
   Registro (form id="registro-form")
========================= */
function handleRegisterPage(){
  const form =
    document.getElementById('registro-form') ||
    document.getElementById('registroForm') ||
    document.querySelector('form[data-role="registro"]');
  if(!form) return;

  const nacimiento = document.getElementById('nacimiento');
  const nacimientoErr = document.getElementById('nacimiento-error');
  maskDateInput(nacimiento);

  function validDateDDMMYYYY(s){
    if(!/^\d{2}\/\d{2}\/\d{4}$/.test(s)) return false;
    const [d,m,y]=s.split('/').map(n=>+n);
    const dt = new Date(y, m-1, d);
    return dt.getFullYear()===y && (dt.getMonth()+1)===m && dt.getDate()===d;
  }

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const nombre    = (document.getElementById('reg-nombre')?.value     || form.nombre?.value || '').trim();
    const apellidos = (document.getElementById('reg-apellidos')?.value  || form.apellidos?.value || '').trim();
    const email     = (document.getElementById('reg-email')?.value      || form.email?.value || '').trim().toLowerCase();
    const residencia= (document.getElementById('reg-residencia')?.value || form.residencia?.value || '').trim();
    const nac       = (document.getElementById('nacimiento')?.value     || form.nacimiento?.value || '').trim();
    const telefono  = (document.getElementById('reg-telefono')?.value   || form.telefono?.value || '').trim();
    const pass      = (document.getElementById('reg-password')?.value   || form.password?.value || '');
    const pass2     = (document.getElementById('confirm-password')?.value || form['confirm-password']?.value || '');

    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ alert('Correo no válido.'); return; }
    if(pass.length<8){ alert('La contraseña debe tener al menos 8 caracteres.'); return; }
    if(pass!==pass2){ alert('Las contraseñas no coinciden.'); return; }
    if(nac && !validDateDDMMYYYY(nac)){ nacimientoErr && (nacimientoErr.style.display='block'); return; }
    nacimientoErr && (nacimientoErr.style.display='none');

    try{
      const { token, user } = await apiRegister({
        nombre, apellidos, email, residencia,
        fecha_nacimiento: nac || null,
        telefono: telefono || null,
        password: pass
      });
      saveAuth({ token, user });
      try{ sendWelcomeEmail?.({nombre,email}); }catch(_){}
      window.location.href='panel.html';
    }catch(err){
      const code = err?.error;
      if(code==='EMAIL_YA_REGISTRADO'){ alert('Ya existe una cuenta con ese correo.'); return; }
      alert('Error al registrar. Código: ' + (code||'DESCONOCIDO'));
    }
  });
}

/* =========================
   Login (form id="login-form")
========================= */
function handleLoginPage(){
  const form = document.getElementById('login-form');
  if(!form) return;
  const err = document.getElementById('login-error');

  const pwd = document.getElementById('login-password');
  const toggle = document.getElementById('toggle-login-password');
  if(toggle && pwd){
    toggle.addEventListener('click', ()=>{
      pwd.type = (pwd.type==='password' ? 'text' : 'password');
      toggle.setAttribute('aria-pressed', String(pwd.type==='text'));
    });
  }

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const email=(form.email?.value||'').trim().toLowerCase();
    const password=(form.password?.value||'');

    try{
      const { token, user } = await apiLogin({ email, password });
      saveAuth({ token, user });
      if(err) err.style.display='none';
      window.location.href = 'panel.html';
    }catch(ex){
      if(err){
        err.style.display='block';
        if(ex?.error==='USUARIO_NO_ENCONTRADO') err.textContent='No existe una cuenta con ese correo.';
        else if(ex?.error==='PASSWORD_INCORRECTA') err.textContent='Contraseña incorrecta.';
        else err.textContent='No se pudo iniciar sesión.';
      }else{
        alert('Error al iniciar sesión.');
      }
    }
  });
}

/* =========================
   Crear grupo (localStorage)
========================= */
function loadGroups(){ try { return JSON.parse(localStorage.getItem('bricksy_groups')||'[]'); } catch(e){ return []; } }
function saveGroups(groups){ localStorage.setItem('bricksy_groups', JSON.stringify(groups)); }
function nextGroupId(){
  const groups = loadGroups();
  const maxId = groups.reduce((m,g)=>Math.max(m, g.id||0), 0);
  return maxId + 1;
}

function handleCreateGroupPage(){
  const form = document.getElementById('crear-grupo-form');
  if(!form) return;

  const portadaInput = document.getElementById('portada');
  const portadaPreview = document.getElementById('portada-preview');

  portadaInput?.addEventListener('change', async ()=>{
    const f = portadaInput.files?.[0];
    if(f){
      const data = await readFileAsDataURL(f);
      portadaPreview.src = data;
      portadaPreview.style.display = 'block';
    } else {
      portadaPreview.style.display = 'none';
      portadaPreview.src = '';
    }
  });

  form.addEventListener('submit', async (e)=>{
    e.preventDefault();
    const auth = getAuth(); if(!auth){ alert('Inicia sesión.'); window.location.href='login.html'; return; }

    const titulo=(form.titulo?.value||'').trim();
    const descripcion=(form.descripcion?.value||'').trim();
    const zona=(form.zona?.value||'').trim();
    const objetivo=(form.objetivo?.value||'').trim();
    const tipo=(form.tipo?.value||'').trim();
    const inversionTotal=Number((form.inversion_total?.value||'').toString().replace(/[^\d.]/g,''))||0;
    const aporteMinimo=Number((form.aporte_minimo?.value||'').toString().replace(/[^\d.]/g,''))||0;
    const limiteMiembros=Number(form.limite_miembros?.value||0)||0;
    const fechaObjetivo=(form.fecha_objetivo?.value||'').trim();
    const f = portadaInput?.files?.[0]||null;
    let portada=null;
    if(f){
      try{ portada = await readFileAsDataURL(f); }catch(_){}
    }

    if(!titulo){ alert('Título requerido.'); return; }
    if(inversionTotal<=0){ alert('Inversión total debe ser mayor que 0.'); return; }
    if(aporteMinimo<0){ alert('Aportación mínima no puede ser negativa.'); return; }
    if(limiteMiembros && limiteMiembros<2){ alert('Límite de miembros debe ser al menos 2.'); return; }

    const g = {
      id: nextGroupId(),
      titulo, descripcion, zona, objetivo, tipo_inmueble: tipo,
      inversion_total: inversionTotal,
      aporte_minimo: aporteMinimo,
      limite_miembros: limiteMiembros || null,
      miembros: [auth.email],
      fecha_objetivo: fechaObjetivo || null,
      portada: portada || null,
      createdBy: auth.email,
      createdAt: Date.now()
    };

    const groups = loadGroups();
    groups.push(g);
    saveGroups(groups);

    window.location.href = `grupo_creado.html?id=${encodeURIComponent(g.id)}`;
  });
}

/* =========================
   Listado de grupos + filtros
========================= */
function renderGroupCard(g){
  const miembrosCount = Array.isArray(g.miembros) ? g.miembros.length : 0;
  const cap = g.limite_miembros ? `${miembrosCount}/${g.limite_miembros}` : `${miembrosCount}`;
  return `
    <article class="card">
      <div class="card-media">${ g.portada ? `<img src="${g.portada}" alt="Portada grupo">` : `<div class="ph-media">Sin imagen</div>` }</div>
      <div class="card-body">
        <h3>${g.titulo||'Sin título'}</h3>
        <p class="muted">${g.zona ? g.zona+' · ' : ''}${g.tipo_inmueble||'–'}${g.objetivo? ' · '+g.objetivo: ''}</p>
        <p class="money"><strong>${formatMoney(g.inversion_total)}</strong> · Aporte mín: ${formatMoney(g.aporte_minimo)}</p>
        <p class="muted">Miembros: ${cap}${g.fecha_objetivo ? ' · Objetivo: '+g.fecha_objetivo : ''}</p>
        <div class="card-actions">
          <a href="crear_grupo.html" class="btn" data-require-auth>Unirme (futuro)</a>
        </div>
      </div>
    </article>
  `;
}
function applyGroupFilters(groups, f){
  let arr = groups.slice();
  if(f.zona){
    const z = f.zona.trim().toLowerCase();
    arr = arr.filter(g => (g.zona||'').toLowerCase().includes(z));
  }
  if(f.objetivo){
    arr = arr.filter(g => (g.objetivo||'') === f.objetivo);
  }
  if(f.orden){
    if(f.orden === 'novedad'){
      arr.sort((a,b)=> (b.createdAt||0) - (a.createdAt||0));
    } else if(f.orden === 'inversion_asc'){
      arr.sort((a,b)=> (a.inversion_total||0) - (b.inversion_total||0));
    } else if(f.orden === 'inversion_desc'){
      arr.sort((a,b)=> (b.inversion_total||0) - (a.inversion_total||0));
    } else if(f.orden === 'miembros_desc'){
      arr.sort((a,b)=> (b.miembros?.length||0) - (a.miembros?.length||0));
    }
  }
  return arr;
}
function handleGroupsPage(){
  const list = document.getElementById('groups-list');
  const empty = document.getElementById('groups-empty');
  const form = document.getElementById('groups-filters');
  if(!list || !form) return;

  function render(){
    const groups = loadGroups();
    const filters = {
      zona: form.zona.value || '',
      objetivo: form.objetivo.value || '',
      orden: form.orden.value || 'novedad'
    };
    const arr = applyGroupFilters(groups, filters);

    if(arr.length===0){
      list.innerHTML='';
      empty.style.display='block';
    } else {
      empty.style.display='none';
      list.innerHTML = arr.map(renderGroupCard).join('');
      guardCTAs(); // re-enlazar
    }
  }

  form.addEventListener('input', render);
  form.addEventListener('submit', (e)=>{ e.preventDefault(); render(); });
  render();
}

/* =========================
   Panel: mis datos y grupos
========================= */
function handlePanelPage(){
  const panel = document.getElementById('panel-datos');
  if(panel){
    const auth=getAuth(); if(!auth) return;
    panel.querySelector('[data-field="nombre"]')?.replaceChildren(document.createTextNode(auth.nombre||'-'));
    panel.querySelector('[data-field="email"]')?.replaceChildren(document.createTextNode(auth.email||'-'));
    panel.querySelector('[data-field="nacimiento"]')?.replaceChildren(document.createTextNode(auth.fecha_nacimiento || auth.nacimiento || '-'));
  }

  const mine = document.getElementById('mis-grupos');
  if(!mine) return;
  const auth = getAuth(); if(!auth) return;

  const groups = loadGroups();
  const myGroups = groups.filter(g => g.createdBy===auth.email || (g.miembros||[]).includes(auth.email));

  if(myGroups.length===0){
    mine.innerHTML = `<p class="muted">Aún no perteneces a ningún grupo.</p>`;
  } else {
    mine.innerHTML = `
      <div class="cards-grid">
        ${myGroups.map(renderGroupCard).join('')}
      </div>
    `;
    guardCTAs();
  }
}

/* =========================
   EmailJS (opcional)
========================= */
(function(){
  try{
    if(window.emailjs && !window._emailjsInited){
      emailjs.init('jPXDeabfPZIW8LNQc'); // Reemplaza si usas otra PUBLIC KEY
      window._emailjsInited = true;
    }
  }catch(_){}
})();
function sendWelcomeEmail({nombre,email}){
  if(!window.emailjs) return;
  const params={ to_name:nombre||'inversor', to_email:email, support_email:'bricksysoporte@gmail.com' };
  emailjs.send('service_qpi87q8','template_usoechd',params)
    .then(()=>console.log('Bienvenida enviada'))
    .catch(err=>console.warn('Email bienvenida falló',err));
}

/* =========================
   Boot
========================= */
document.addEventListener('DOMContentLoaded', ()=>{
  renderAuthUI();
  guardPrivatePages();
  guardCTAs();

  handleRegisterPage();
  handleLoginPage();
  handleCreateGroupPage();
  handleGroupsPage();
  handlePanelPage();
});
