// Inline confirmation rows for the admin (no browser dialogs, no modals). Loaded first in the bundle.
// askInline(anchor, msg, yesLabel) -> Promise<boolean>; askChoice(anchor, msg, [[value,label],...]) -> Promise<value|null>
window.askChoice = function (anchor, msg, opts) {
  return new Promise(res => {
    const at = anchor.closest('label') || anchor;
    if (at.nextElementSibling?.classList.contains('confirm-row')) at.nextElementSibling.remove();
    const row = document.createElement('div'); row.className = 'confirm-row'; row.setAttribute('role', 'group');
    const p = document.createElement('p'); p.textContent = msg; row.appendChild(p);
    const acts = document.createElement('div'); acts.className = 'confirm-acts'; row.appendChild(acts);
    const done = v => { row.remove(); res(v); };
    opts.forEach(([v, label], i) => { const b = document.createElement('button'); b.type = 'button'; b.className = 'btn' + (i === 0 ? ' neg' : ' ghost'); b.textContent = label; b.onclick = () => done(v); acts.appendChild(b); });
    if (!opts.some(o => o[0] === null)) { const c = document.createElement('button'); c.type = 'button'; c.className = 'btn ghost'; c.textContent = 'Cancelar'; c.onclick = () => done(null); acts.appendChild(c); }
    at.insertAdjacentElement('afterend', row);
    row.querySelector('button').focus();
  });
};
window.askInline = (anchor, msg, yes = 'Sí, confirmar') => window.askChoice(anchor, msg, [[true, yes]]).then(v => v === true);
