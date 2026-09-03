// meals.js
async function renderMeals(content) {
  const entries = await DB.getMealEntries();
  const settings = await DB.getSettings();
  const groups = groupByDate(entries);

  content.innerHTML = `
    <div class="btn-row" style="margin-bottom:${settings.calorieGoal ? '6px' : '16px'};">
      <button class="btn btn-ghost" id="repeat-meal-btn">Past</button>
      <button class="btn btn-primary btn-block" id="log-meal-btn">+ Log Meal</button>
      <button class="btn btn-ghost" id="calorie-target-btn">Target</button>
    </div>
    ${settings.calorieGoal ? `<div class="stat-label" style="margin-bottom:16px;">Daily target: ${settings.calorieGoal} cal</div>` : ''}
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
              <div class="list-item-sub">${m.items.length} item${m.items.length !== 1 ? 's' : ''}</div>
            </div>
            <div class="list-item-meta">${Math.round(mealTotalCalories(m))} cal</div>
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
  document.getElementById('calorie-target-btn').onclick = () => openCalorieTargetForm(settings);
}

function openCalorieTargetForm(settings) {
  const bodyHtml = `
    <div class="field">
      <label>Daily Calorie Target</label>
      <input type="number" inputmode="numeric" id="calorie-target" value="${settings.calorieGoal || ''}" placeholder="e.g. 2200" />
    </div>
    <button class="btn btn-primary btn-block" id="calorie-target-save">Save</button>
  `;
  openSheet('Set Daily Calorie Target', bodyHtml, (body) => {
    body.querySelector('#calorie-target-save').onclick = async () => {
      const calorieGoal = Number(body.querySelector('#calorie-target').value) || null;
      await DB.saveSettings({ calorieGoal });
      closeSheet();
      showToast('Target updated');
      renderApp();
    };
  });
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
          <div class="list-item-meta">${Math.round(caloriesForItem(it))} cal</div>
        </div>
      `).join('')}
    </div>
    <div class="btn-row" style="margin-bottom:10px;">
      <button class="btn btn-primary btn-block" id="duplicate-btn">Duplicate to Today</button>
    </div>
    <div class="btn-row">
      <button class="btn btn-ghost btn-block" id="edit-meal-btn">Edit</button>
      <button class="btn btn-danger btn-block" id="delete-meal-btn">Delete</button>
    </div>
  `;
  const sheet = openSheet(escapeHtml(meal.name), bodyHtml, (body) => {
    body.querySelector('#duplicate-btn').onclick = async () => {
      await DB.saveMealEntry({ date: DB.todayISO(), name: meal.name, items: meal.items.map(it => ({ name: it.name, calories: caloriesForItem(it) })) });
      closeSheet();
      showToast('Meal added to today');
      renderApp();
    };
    body.querySelector('#edit-meal-btn').onclick = () => {
      closeSheet();
      openMealForm(meal);
    };
    body.querySelector('#delete-meal-btn').onclick = async () => {
      if (!confirm(`Delete "${meal.name}"? This can't be undone.`)) return;
      await DB.delete('mealEntries', meal.id);
      closeSheet();
      showToast('Meal deleted');
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
              <div class="list-item-sub">${m.items.length} item${m.items.length !== 1 ? 's' : ''}</div>
            </div>
            <button class="btn btn-sm btn-primary">${Math.round(mealTotalCalories(m))} cal · Add</button>
          </div>
        `);
        row.querySelector('button').onclick = async (e) => {
          e.stopPropagation();
          await DB.saveMealEntry({ date: DB.todayISO(), name: m.name, items: m.items.map(it => ({ name: it.name, calories: caloriesForItem(it) })) });
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

function openMealForm(existingMeal) {
  let itemCount = 0;
  const isEdit = !!existingMeal;
  const bodyHtml = `
    <div class="field">
      <label>Meal Name</label>
      <input type="text" id="meal-name" placeholder="e.g. Caesar Salad – Cheesecake Factory" value="${isEdit ? escapeHtml(existingMeal.name) : ''}" />
    </div>
    <div class="field">
      <label>Date</label>
      <input type="date" id="meal-date" value="${isEdit ? existingMeal.date : DB.todayISO()}" />
    </div>
    <div id="item-rows"></div>
    <button class="btn btn-ghost btn-block" id="add-item-btn" style="margin-bottom:16px;">+ Add Food Item</button>
    <button class="btn btn-primary btn-block" id="save-meal-btn">${isEdit ? 'Save Changes' : 'Save Meal'}</button>
  `;
  const sheet = openSheet(isEdit ? 'Edit Meal' : 'Log Meal', bodyHtml, (body) => {
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
          <div class="item-row-grid item-row-grid-single">
            <div>
              <div class="mini-label">Calories</div>
              <input type="number" inputmode="numeric" class="item-calories" value="${prefill ? Math.round(caloriesForItem(prefill)) : ''}" placeholder="0" />
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
                <span class="ac-macro">${Math.round(caloriesForItem(r))} cal</span>
              </div>
            `);
            item.onclick = () => {
              nameInput.value = r.name;
              row.querySelector('.item-calories').value = Math.round(caloriesForItem(r));
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

    if (isEdit && existingMeal.items.length) {
      existingMeal.items.forEach(it => addItemRow(it));
    } else {
      addItemRow();
    }
    body.querySelector('#add-item-btn').onclick = () => addItemRow();

    body.querySelector('#save-meal-btn').onclick = async () => {
      const name = body.querySelector('#meal-name').value.trim();
      const date = body.querySelector('#meal-date').value || DB.todayISO();
      if (!name) { showToast('Meal name is required'); return; }
      const rows = Array.from(rowsEl.querySelectorAll('.item-row'));
      const items = rows.map(r => ({
        name: r.querySelector('.item-name').value.trim(),
        calories: Number(r.querySelector('.item-calories').value) || 0
      })).filter(it => it.name);
      if (items.length === 0) { showToast('Add at least one food item'); return; }
      await DB.saveMealEntry({ id: isEdit ? existingMeal.id : undefined, date, name, items });
      closeSheet();
      showToast(isEdit ? 'Meal updated' : 'Meal saved');
      renderApp();
    };
  });
}
