/* Module d'interface : panneau de gestion des comptes (réservé à l'admin).
   À charger après le script principal de la Matrice. */
const MATRICE_PERMISSION_LABELS = {
  dashboard_read:'Consulter le tableau de bord', matrix_read:'Consulter la matrice', matrix_write:'Modifier la matrice',
  partners_read:'Consulter les partenaires', partners_write:'Gérer les partenaires',
  activities_read:'Consulter les activités', activities_write:'Gérer les activités',
  indicators_read:'Consulter les indicateurs', indicators_write:'Modifier les indicateurs', exports:'Exporter les données'
};
let matriceCurrentAccess = null;
async function matriceLoadAccess() {
  const r = await fetch('/api/access/me', { credentials:'same-origin' });
  if (!r.ok) throw new Error('Session requise');
  matriceCurrentAccess = await r.json();
  document.documentElement.dataset.role = matriceCurrentAccess.role;
  document.querySelectorAll('[data-permission]').forEach(el => {
    const p = el.dataset.permission;
    el.hidden = matriceCurrentAccess.role !== 'admin' && matriceCurrentAccess.permissions?.[p] !== true;
  });
  document.querySelectorAll('[data-admin-only]').forEach(el => el.hidden = matriceCurrentAccess.role !== 'admin');
  return matriceCurrentAccess;
}
async function matriceRenderUserManager(container) {
  if (matriceCurrentAccess?.role !== 'admin') throw new Error('Accès administrateur uniquement.');
  const r = await fetch('/api/access/users', { credentials:'same-origin' });
  if (!r.ok) throw new Error('Impossible de charger les comptes.');
  const users = await r.json();
  container.innerHTML = `<h2>Gestion des comptes et des profils</h2><p>Admin : tous les droits. Utilisateur : uniquement les tâches autorisées ci-dessous.</p>` +
    (users.length ? users.map(u => `<form class="role-user" data-id="${escRole(u.id)}" style="padding:14px;border:1px solid #dce6e0;border-radius:10px;margin:10px 0">
      <b>${escRole(u.username)}</b> <small>(${escRole(u.id)})</small>
      <div style="display:flex;gap:12px;flex-wrap:wrap;margin:10px 0"><label>Profil <select name="role"><option value="utilisateur" ${u.role==='utilisateur'?'selected':''}>Utilisateur</option><option value="admin" ${u.role==='admin'?'selected':''}>Admin</option></select></label>
      <label><input type="checkbox" name="active" ${u.active?'checked':''}> Compte actif</label></div>
      <div class="permissions">${Object.entries(MATRICE_PERMISSION_LABELS).map(([k,label])=>`<label style="display:inline-flex;gap:5px;margin:5px 12px 5px 0"><input type="checkbox" name="${k}" ${u.permissions?.[k]?'checked':''}>${label}</label>`).join('')}</div>
      <button type="submit" class="btn primary" style="margin-top:10px">Enregistrer les droits</button>
    </form>`).join('') : '<p>Aucun compte trouvé.</p>');
  container.querySelectorAll('form.role-user').forEach(form => form.addEventListener('submit', async e => {
    e.preventDefault(); const f = new FormData(form), role = f.get('role');
    const permissions = Object.fromEntries(Object.keys(MATRICE_PERMISSION_LABELS).map(k=>[k,f.get(k)==='on']));
    const response = await fetch(`/api/access/users/${encodeURIComponent(form.dataset.id)}/role`, {
      method:'PUT', credentials:'same-origin', headers:{'Content-Type':'application/json'},
      body:JSON.stringify({role,active:f.get('active')==='on',permissions})
    });
    if (!response.ok) { const x=await response.json().catch(()=>({})); alert(x.error||'Erreur lors de l’enregistrement.'); return; }
    alert('Droits mis à jour.'); matriceRenderUserManager(container);
  }));
}
function escRole(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
window.matriceLoadAccess = matriceLoadAccess;
window.matriceRenderUserManager = matriceRenderUserManager;
