// meals.js
async function renderMeals(content) {
  const entries = await DB.getMealEntries();
  const groups = groupByDate(entries);

  content.innerHTML = `
    <div class="btn-row" style="margin-bottom:16px;">
      <button class="btn btn-primary btn-block" id="log-meal-btn">+ Log Meal</button>
      <button class="btn btn-ghost" id="repeat-meal-btn">Repeat Past</button>
    </div>
    <div id="meals-list"></div>
  `;

  const list = document.getElementById('meals-list');
  if (entries.length === 0) {
    list.innerHTML = `<div class="empty-state">No meals logged yet.<br>Tap "Log Meal" to add your first one.</div>`;
  } else {
    for (const [date, items] of groups) {
      const heading = el(`<div class="date-heading">${formatDate(date)}</div>`);
      list.appendChild(heading);
      const card = el(`<div class="card"></div>`);
      items.forEach((m, i) => {
        const row = el(`
          <div class="list-item" data-id="${m.id}" style="cursor:pointer;">
            <div class="list-item-main">
              <div class="list-item-title">${escapeHtml(m.name)}</div>
              <div class="list-item-sub">${m.items.length} item${m.items.length !== 1 ? 's' : ''} · P${round1(m.totals.protein)} C${round1(m.totals.carbs)} F${round1(m.totals.fat)}</div>
            </div>
            <div class="list-item-meta">${Math.round(m.totals.protein * 4 + m.totals.carbs * 4 + m.totals.fat * 9)} cal</div>
          </div>
        `);
        row.onclick = () => openMealDetail(m);
        card.appendChild(row);
      });
      list.appendChild(card);
    }
  }

  document.getElementById('log-meal-btn').onclick = () => openMealForm();
  document.getElementById('repeat-meal-btn').onclick = () => openRepeatPicker();
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function openMealDetail(meal) {
  const bodyHtml = `
    <div class="card" style="margin-bottom:12px;">
      ${meal.items.map(it => `
        <div class="list-item">
          <div class="list-item-main">
            <div class="list-item-title">${escapeHtml(it.name)}</div>
          </div>
          <div class="list-item-meta">P${round1(it.protein)} C${round1(it.carbs)} F${round1(it.fat)}</div>
        </div>
      `).join('')}
    </div>
    <div class="btn-row">
      <button class="btn btn-primary btn-block" id="duplicate-btn">Duplicate to Today</button>
    </div>
  `;
  const sheet = openSheet(escapeHtml(meal.name), bodyHtml, (body) => {
    body.querySelector('#duplicate-btn').onclick = async () => {
      await DB.saveMealEntry({ date: DB.todayISO(), name: meal.name, items: meal.items.map(it => ({ name: it.name, protein: it.protein, carbs: it.carbs, fat: it.fat })) });
      closeSheet();
      showToast('Meal added to today');
      renderApp();
    };
  });
}

async function openRepeatPicker() {
  const uniqueMeals = await DB.getUniqueMealNames();
  const bodyHtml = `
    <div class="field">
      <input type="text" id="repeat-search" placeholder="Search past meals…" />
    </div>
    <div id="repeat-results"></div>
  `;
  const sheet = openSheet('Repeat a Past Meal', bodyHtml, (body) => {
    const resultsEl = body.querySelector('#repeat-results');
    const renderResults = (query) => {
      const q = query.trim().toLowerCase();
      const filtered = q ? uniqueMeals.filter(m => m.name.toLowerCase().includes(q)) : uniqueMeals;
      if (filtered.length === 0) {
        resultsEl.innerHTML = `<div class="empty-state">No matches</div>`;
        return;
      }
      resultsEl.innerHTML = '';
      const card = el(`<div class="card"></div>`);
      filtered.slice(0, 15).forEach(m => {
        const row = el(`
          <div class="list-item" style="cursor:pointer;">
            <div class="list-item-main">
              <div class="list-item-title">${escapeHtml(m.name)}</div>
              <div class="list-item-sub">P${round1(m.totals.protein)} C${round1(m.totals.carbs)} F${round1(m.totals.fat)}</div>
            </div>
            <button class="btn btn-sm btn-primary">Add</button>
          </div>
        `);
        row.querySelector('button').onclick = async (e) => {
          e.stopPropagation();
          await DB.saveMealEntry({ date: DB.todayISO(), name: m.name, items: m.items.map(it => ({ name: it.name, protein: it.protein, carbs: it.carbs, fat: it.fat })) });
          closeSheet();
          showToast('Meal added to today');
          renderApp();
        };
        card.appendChild(row);
      });
      resultsEl.appendChild(card);
    };
    renderResults('');
    body.querySelector('#repeat-search').addEventListener('input', (e) => renderResults(e.target.value));
  });
}

function openMealForm() {
  let itemCount = 0;
  const bodyHtml = `
    <div class="field">
      <label>Meal Name</label>
      <input type="text" id="meal-name" placeholder="e.g. Caesar Salad – Cheesecake Factory" />
    </div>
    <div class="field">
      <label>Date</label>
      <input type="date" id="meal-date" value="${DB.todayISO()}" />
    </div>
    <div id="item-rows"></div>
    <button class="btn btn-ghost btn-block" id="add-item-btn" style="margin-bottom:16px;">+ Add Food Item</button>
    <button class="btn btn-primary btn-block" id="save-meal-btn">Save Meal</button>
  `;
  const sheet = openSheet('Log Meal', bodyHtml, (body) => {
    const rowsEl = body.querySelector('#item-rows');

    function addItemRow(prefill) {
      itemCount++;
      const rowId = 'item-' + itemCount;
      const row = el(`
        <div class="item-row" id="${rowId}">
          <button type="button" class="remove-btn" aria-label="Remove item">&times;</button>
          <div class="autocomplete-wrap">
            <div class="field" style="margin-bottom:0;">
              <label>Food Item</label>
              <input type="text" class="item-name" placeholder="e.g. Cup of soup" value="${prefill ? escapeHtml(prefill.name) : ''}" autocomplete="off" />
            </div>
            <div class="autocomplete-list" style="display:none;"></div>
          </div>
          <div class="item-row-grid">
            <div>
              <div class="mini-label">Protein (g)</div>
              <input type="number" inputmode="decimal" class="item-protein" value="${prefill ? prefill.protein : ''}" placeholder="0" />
            </div>
            <div>
              <div class="mini-label">Carbs (g)</div>
              <input type="number" inputmode="decimal" class="item-carbs" value="${prefill ? prefill.carbs : ''}" placeholder="0" />
            </div>
            <div>
              <div class="mini-label">Fat (g)</div>
              <input type="number" inputmode="decimal" class="item-fat" value="${prefill ? prefill.fat : ''}" placeholder="0" />
            </div>
          </div>
        </div>
      `);
      row.querySelector('.remove-btn').onclick = () => row.remove();

      const nameInput = row.querySelector('.item-name');
      const acList = row.querySelector('.autocomplete-list');
      let debounceTimer;
      nameInput.addEventListener('input', () => {
        clearTimeout(debounceTimer);
        const q = nameInput.value;
        debounceTimer = setTimeout(async () => {
          if (!q.trim()) { acList.style.display = 'none'; return; }
          const results = await DB.searchFoodItems(q);
          if (results.length === 0) { acList.style.display = 'none'; return; }
          acList.innerHTML = '';
          results.forEach(r => {
            const item = el(`
              <div class="autocomplete-item">
                <span>${escapeHtml(r.name)}</span>
                <span class="ac-macro">P${round1(r.protein)} C${round1(r.carbs)} F${round1(r.fat)}</span>
              </div>
            `);
            item.onclick = () => {
              nameInput.value = r.name;
              row.querySelector('.item-protein').value = r.protein;
              row.querySelector('.item-carbs').value = r.carbs;
              row.querySelector('.item-fat').value = r.fat;
              acList.style.display = 'none';
            };
            acList.appendChild(item);
          });
          acList.style.display = 'block';
        }, 180);
      });
      nameInput.addEventListener('blur', () => setTimeout(() => acList.style.display = 'none', 150));

      rowsEl.appendChild(row);
    }

    addItemRow();
    body.querySelector('#add-item-btn').onclick = () => addItemRow();

    body.querySelector('#save-meal-btn').onclick = async () => {
      const name = body.querySelector('#meal-name').value.trim();
      const date = body.querySelector('#meal-date').value || DB.todayISO();
      if (!name) { showToast('Meal name is required'); return; }
      const rows = Array.from(rowsEl.querySelectorAll('.item-row'));
      const items = rows.map(r => ({
        name: r.querySelector('.item-name').value.trim(),
        protein: Number(r.querySelector('.item-protein').value) || 0,
        carbs: Number(r.querySelector('.item-carbs').value) || 0,
        fat: Number(r.querySelector('.item-fat').value) || 0
      })).filter(it => it.name);
      if (items.length === 0) { showToast('Add at least one food item'); return; }
      await DB.saveMealEntry({ date, name, items });
      closeSheet();
      showToast('Meal saved');
      renderApp();
    };
  });
}
