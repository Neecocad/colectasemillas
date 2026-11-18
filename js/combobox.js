// Lista desplegable con búsqueda ("combobox"): un campo de texto donde se escribe
// y una lista que se va filtrando con cada letra. Solo acepta valores de la
// lista: si al salir del campo lo escrito no coincide con ninguna opción, se
// borra (o se completa solo, si quedaba exactamente una opción posible).
//
// La búsqueda ignora mayúsculas y tildes ("rio" encuentra "Río") y busca en
// cualquier parte del texto ("macro" encuentra "Sophora macrocarpa").
//
// Se usa un componente propio en vez de <datalist> porque <datalist> filtra
// distinto en cada navegador (en iPhone casi no filtra) y no impide escribir
// valores que no están en la lista.

const MAX_VISIBLES = 100;

export function normalizar(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

export class Combobox {
  // input: <input type="text">; opciones: función que devuelve el arreglo vigente
  // (puede cambiar, p. ej. provincias según región); onCambio(valor): se llama
  // cuando el valor elegido cambia por acción de la persona.
  constructor(input, { opciones, onCambio = () => {} }) {
    this.input = input;
    this.opciones = opciones;
    this.onCambio = onCambio;
    this.valor = '';
    this.activo = -1;

    const wrap = document.createElement('div');
    wrap.className = 'combo';
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('autocomplete', 'off');

    this.btn = document.createElement('button');
    this.btn.type = 'button';
    this.btn.className = 'combo-btn';
    this.btn.tabIndex = -1;
    this.btn.setAttribute('aria-label', 'Mostrar opciones');
    wrap.appendChild(this.btn);

    this.lista = document.createElement('ul');
    this.lista.className = 'combo-lista hidden';
    this.lista.setAttribute('role', 'listbox');
    wrap.appendChild(this.lista);

    input.addEventListener('focus', () => this.abrir());
    input.addEventListener('click', () => this.abrir());
    input.addEventListener('input', () => { this.activo = -1; this.abrir(); });
    input.addEventListener('keydown', (e) => this.tecla(e));
    input.addEventListener('blur', () => this.confirmar());
    // pointerdown + preventDefault: el campo no pierde el foco antes de elegir.
    this.lista.addEventListener('pointerdown', (e) => {
      const li = e.target.closest('li[data-valor]');
      e.preventDefault();
      if (li) this.elegir(li.dataset.valor);
    });
    this.btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (this.input.disabled) return;
      if (this.lista.classList.contains('hidden')) { this.input.focus(); this.abrir(true); }
      else this.cerrar();
    });
  }

  filtradas(todas = false) {
    const ops = this.opciones();
    const q = normalizar(this.input.value);
    // Con un valor ya elegido y sin cambios, se muestra la lista completa.
    if (todas || !q || this.input.value === this.valor) return ops;
    return ops.filter((o) => normalizar(o).includes(q));
  }

  abrir(todas = false) {
    if (this.input.disabled || this.input.readOnly) return;
    const ops = this.filtradas(todas);
    this.lista.innerHTML = '';
    if (!ops.length) {
      const li = document.createElement('li');
      li.className = 'combo-vacio';
      li.textContent = 'Sin coincidencias';
      this.lista.appendChild(li);
    }
    ops.slice(0, MAX_VISIBLES).forEach((o, i) => {
      const li = document.createElement('li');
      li.dataset.valor = o;
      li.setAttribute('role', 'option');
      li.textContent = o;
      if (o === this.valor) li.classList.add('elegido');
      if (i === this.activo) li.classList.add('activo');
      this.lista.appendChild(li);
    });
    if (ops.length > MAX_VISIBLES) {
      const li = document.createElement('li');
      li.className = 'combo-vacio';
      li.textContent = `… y ${ops.length - MAX_VISIBLES} más: escribe para filtrar`;
      this.lista.appendChild(li);
    }
    this.lista.classList.remove('hidden');
    this.input.setAttribute('aria-expanded', 'true');
  }

  cerrar() {
    this.lista.classList.add('hidden');
    this.input.setAttribute('aria-expanded', 'false');
    this.activo = -1;
  }

  tecla(e) {
    const items = [...this.lista.querySelectorAll('li[data-valor]')];
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (this.lista.classList.contains('hidden')) this.abrir();
      if (!items.length) return;
      this.activo = (this.activo + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length;
      items.forEach((li, i) => li.classList.toggle('activo', i === this.activo));
      items[this.activo].scrollIntoView({ block: 'nearest' });
    } else if (e.key === 'Enter') {
      e.preventDefault(); // Enter no envía el formulario desde aquí
      const elegido = items[this.activo] || (items.length === 1 ? items[0] : null);
      if (elegido) this.elegir(elegido.dataset.valor);
    } else if (e.key === 'Escape') {
      this.input.value = this.valor;
      this.cerrar();
    }
  }

  elegir(valor) {
    this.cerrar();
    this.fijar(valor, true);
  }

  // Al salir del campo: acepta lo escrito solo si corresponde a una opción.
  confirmar() {
    this.cerrar();
    const texto = this.input.value;
    if (texto === this.valor) return;
    const q = normalizar(texto);
    if (!q) { this.fijar('', true); return; }
    const ops = this.opciones();
    const exacta = ops.find((o) => normalizar(o) === q);
    const parciales = ops.filter((o) => normalizar(o).includes(q));
    const v = exacta || (parciales.length === 1 ? parciales[0] : '');
    this.fijar(v, true);
  }

  // Fija el valor. Con `avisar` se dispara onCambio (acción de la persona); sin
  // él es un cambio hecho por el código (p. ej. autocompletar el nombre común).
  fijar(valor, avisar = false) {
    const cambio = valor !== this.valor;
    this.valor = valor;
    this.input.value = valor;
    this.input.classList.remove('invalido');
    if (avisar && cambio) this.onCambio(valor);
  }

  habilitar(si) {
    this.input.disabled = !si;
    if (!si) this.cerrar();
  }
}
