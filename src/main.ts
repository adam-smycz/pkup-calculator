import { fetchPRs, loadPRs, type PullRequest } from './github';
import { exportXlsx } from './export';

const YEARS = [2026, 2027, 2028, 2029, 2030];

const MONTHS: { slug: string; label: string; short: string }[] = [
  { slug: 'january',   label: 'Styczeń',     short: 'sty' },
  { slug: 'february',  label: 'Luty',        short: 'lut' },
  { slug: 'march',     label: 'Marzec',      short: 'mar' },
  { slug: 'april',     label: 'Kwiecień',    short: 'kwi' },
  { slug: 'may',       label: 'Maj',         short: 'maj' },
  { slug: 'june',      label: 'Czerwiec',    short: 'cze' },
  { slug: 'july',      label: 'Lipiec',      short: 'lip' },
  { slug: 'august',    label: 'Sierpień',    short: 'sie' },
  { slug: 'september', label: 'Wrzesień',    short: 'wrz' },
  { slug: 'october',   label: 'Październik', short: 'paź' },
  { slug: 'november',  label: 'Listopad',    short: 'lis' },
  { slug: 'december',  label: 'Grudzień',    short: 'gru' },
];

const DAY_NAMES = ['Niedziela', 'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota'];

// Cache loaded holiday data per year
const holidayCache = new Map<number, Set<string>>();
const holidayNameCache = new Map<string, string>();

async function loadHolidays(year: number): Promise<void> {
  if (holidayCache.has(year)) return;
  try {
    const res = await fetch(`/data/${year}.json`);
    const data: { holidays: { date: string; name: string }[] } = await res.json();
    const dates = new Set<string>();
    for (const h of data.holidays) {
      dates.add(h.date);
      holidayNameCache.set(h.date, h.name);
    }
    holidayCache.set(year, dates);
  } catch {
    holidayCache.set(year, new Set());
  }
}

function toIso(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseRoute(): { year: number; month: string } {
  const [, yearStr, monthStr] = window.location.pathname.split('/');
  const year = YEARS.includes(Number(yearStr)) ? Number(yearStr) : new Date().getFullYear();
  const month = MONTHS.find(m => m.slug === monthStr)?.slug ?? MONTHS[new Date().getMonth()].slug;
  return { year, month };
}

function navigate(year: number, month: string) {
  history.pushState(null, '', `/${year}/${month}`);
  render();
}

function getDaysForPkup(year: number, monthSlug: string): Date[] {
  const monthIndex = MONTHS.findIndex(m => m.slug === monthSlug);
  const start = new Date(year, monthIndex, 10);
  const end = new Date(year, monthIndex + 1, 9);
  const days: Date[] = [];
  const cursor = new Date(start);
  while (cursor <= end) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

type DayType = 'praca' | 'urlop' | 'l4';

function storageKey(year: number, month: string) {
  return `pkup:${year}/${month}`;
}

function loadState(year: number, month: string): Record<string, DayType> {
  try {
    return JSON.parse(localStorage.getItem(storageKey(year, month)) ?? '{}');
  } catch {
    return {};
  }
}

function saveState(year: number, month: string, state: Record<string, DayType>) {
  localStorage.setItem(storageKey(year, month), JSON.stringify(state));
}

function renderDays(year: number, monthSlug: string) {
  const main = document.querySelector('main')!;
  const days = getDaysForPkup(year, monthSlug);

  const yearsInRange = [...new Set(days.map(d => d.getFullYear()))];
  const holidays = yearsInRange.flatMap(y => [...(holidayCache.get(y) ?? [])]);
  const holidaySet = new Set(holidays);

  const saved = loadState(year, monthSlug);

  const totalWorkingDays = days.filter(d => {
    const iso = toIso(d);
    return d.getDay() !== 0 && d.getDay() !== 6 && !holidaySet.has(iso);
  }).length;
  const Ht = totalWorkingDays * 8;

  const periodStart = days[0];
  const periodEnd   = days[days.length - 1];

  function fmtDate(d: Date) {
    return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getFullYear()).slice(2)}`;
  }

  // Build a map of ISO date → PRs merged on that day
  const isoStart = toIso(days[0]);
  const isoEnd   = toIso(days[days.length - 1]);
  const cachedPRs = loadPRs(isoStart, isoEnd) ?? [];
  const prsByDay = new Map<string, typeof cachedPRs>();
  for (const pr of cachedPRs) {
    const day = pr.mergedAt.slice(0, 10);
    if (!prsByDay.has(day)) prsByDay.set(day, []);
    prsByDay.get(day)!.push(pr);
  }

  const rows = days.map(date => {
    const iso = toIso(date);
    const dayName = DAY_NAMES[date.getDay()];
    const monthShort = MONTHS[date.getMonth()].short;
    const isWeekend = date.getDay() === 0 || date.getDay() === 6;
    const isHoliday = holidaySet.has(iso);
    const holidayName = holidayNameCache.get(iso) ?? '';

    const rowClass = [isWeekend ? 'row--weekend' : '', isHoliday ? 'row--holiday' : '']
      .filter(Boolean).join(' ');

    const isMonday = date.getDay() === 1;
    const defaultType: DayType | null = !isWeekend && !isHoliday ? 'praca' : null;
    const activeType: DayType | null = (saved[iso] as DayType) ?? defaultType;

    const dayPRs = prsByDay.get(iso) ?? [];
    const prLinks = dayPRs.map(pr =>
      `<a class="note-pr" href="${pr.url}" target="_blank" rel="noopener">#${pr.number} ${pr.title}</a>`
    ).join('');
    const noteContent = [holidayName ? `<span>${holidayName}</span>` : '', prLinks].filter(Boolean).join('');

    return `${isMonday ? '<tr class="row--separator"><td colspan="6"></td></tr>' : ''}<tr class="${rowClass}" data-iso="${iso}">
      <td class="col-check"><input type="checkbox" class="day-check day-check--praca" data-type="praca"${activeType === 'praca' ? ' checked' : ''} /></td>
      <td class="col-check"><input type="checkbox" class="day-check day-check--urlop" data-type="urlop"${activeType === 'urlop' ? ' checked' : ''} /></td>
      <td class="col-check"><input type="checkbox" class="day-check day-check--l4" data-type="l4"${activeType === 'l4' ? ' checked' : ''} /></td>
      <td class="col-date">${date.getDate()} ${monthShort}</td>
      <td class="col-day">${dayName}</td>
      <td class="col-note">${noteContent}</td>
    </tr>`;
  }).join('');

  const savedPct = Number(localStorage.getItem(`pkup-pct:${year}/${monthSlug}`) ?? '50');

  main.innerHTML = `
    <div class="pkup-header">
      <div class="pkup-header-top">
        <div class="pkup-period">PKUP ${fmtDate(periodStart)} – ${fmtDate(periodEnd)}</div>
        <div class="pkup-header-actions">
          <div class="pkup-pct-wrap">
            <label class="pkup-pct-label" for="pkup-pct">% pracy twórczej</label>
            <div class="pkup-pct-input-wrap">
              <input id="pkup-pct" class="pkup-pct-input" type="number" min="1" max="100" value="${savedPct}" />
              <span class="pkup-pct-sign">%</span>
            </div>
          </div>
        </div>
      </div>
      <div class="pkup-meta">
        <span>Ht: <strong>${Ht} h</strong> / Dni robocze: <strong>${totalWorkingDays}</strong></span>
        <span class="pkup-meta-sep">·</span>
        <span>Ha: <em>wylicza dział płac</em></span>
        <span class="pkup-meta-sep">·</span>
        <span>P = Hc / (Ht − Ha)</span>
      </div>
      <div class="pkup-info">
        Ustaw, jaki procent swoich godzin pracy poświęciłeś na pracę twórczą (autorską) — np. pisanie kodu, projektowanie, dokumentacja.
        Przykład: przepracowałeś 160 h, z czego 80 h to praca twórcza → ustawiasz <strong>50%</strong>, a Hc = 80 h.
        Na tej podstawie dział płac oblicza podwyższone koszty uzyskania przychodu (50% KUP zamiast standardowych 20%).
        Wzór: <strong>P = Hc / (Ht − Ha)</strong>, gdzie Hc to Twoje godziny twórcze, Ht to nominał okresu, Ha to nieobecności wyliczane przez płace.
      </div>
    </div>
    <div class="summary">
      <span class="summary-item">Ht godziny pracy: <strong class="summary-ht">0</strong> h</span>
      <span class="summary-sep">·</span>
      <span class="summary-item">Hc godziny twórcze: <strong class="summary-hc">0</strong> h</span>
      <span class="summary-sep">·</span>
      <span class="summary-item">Dni pracy: <strong class="summary-days">0</strong></span>
      <span class="summary-sep">·</span>
      <span class="summary-item urlop">Urlop: <strong class="summary-urlop">0</strong> dni</span>
      <span class="summary-sep">·</span>
      <span class="summary-item l4">L4: <strong class="summary-l4">0</strong> dni</span>
    </div>
    <div class="table-toolbar">
      <button class="btn-github" disabled>Sprawdź Githuba</button>
    </div>
    <table class="days-table">
      <thead>
        <tr>
          <th class="col-check">Praca</th>
          <th class="col-check">Urlop</th>
          <th class="col-check">L4</th>
          <th>Data</th>
          <th>Dzień</th>
          <th>Uwagi</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>`;

  const pctInput = main.querySelector<HTMLInputElement>('#pkup-pct')!;

  function updateSummary() {
    const praca = main.querySelectorAll<HTMLInputElement>('.day-check--praca:checked').length;
    const urlop = main.querySelectorAll<HTMLInputElement>('.day-check--urlop:checked').length;
    const l4    = main.querySelectorAll<HTMLInputElement>('.day-check--l4:checked').length;
    const pct   = Math.min(100, Math.max(1, Number(pctInput.value) || 100));
    const ht    = praca * 8;
    const hc    = Math.ceil(ht * pct / 100);
    main.querySelector('.summary-ht')!.textContent    = String(ht);
    main.querySelector('.summary-hc')!.textContent    = String(hc);
    main.querySelector('.summary-days')!.textContent  = `${praca}/${totalWorkingDays}`;
    main.querySelector('.summary-urlop')!.textContent = `${urlop}/${totalWorkingDays}`;
    main.querySelector('.summary-l4')!.textContent    = `${l4}/${totalWorkingDays}`;
  }

  pctInput.addEventListener('input', () => {
    const pct = Math.min(100, Math.max(1, Number(pctInput.value) || 100));
    localStorage.setItem(`pkup-pct:${year}/${monthSlug}`, String(pct));
    updateSummary();
    rerenderPkupTable();
  });

  let rerenderPkupTable = () => {};

  // GitHub button
  const btnGithub = main.querySelector<HTMLButtonElement>('.btn-github')!;

  function clearPRArea() {
    main.querySelector('.pr-list')?.remove();
    main.querySelector('.pr-error')?.remove();
    main.querySelector('.pkup-report-table')?.remove();
  }

  function renderPRError(msg: string) {
    clearPRArea();
    const el = document.createElement('div');
    el.className = 'pr-error';
    el.textContent = msg;
    main.querySelector('.days-table')!.insertAdjacentElement('beforebegin', el);
  }

  type SortKey = 'mergedAt' | 'additions';
  type SortDir = 'asc' | 'desc';
  let sortKey: SortKey = 'additions';
  let sortDir: SortDir = 'desc';

  function renderPRList(prs: PullRequest[]) {
    clearPRArea();
    if (!prs.length) return;

    const sorted = [...prs].sort((a, b) => {
      const va = sortKey === 'additions' ? a.additions : a.mergedAt;
      const vb = sortKey === 'additions' ? b.additions : b.mergedAt;
      const cmp = va < vb ? -1 : va > vb ? 1 : 0;
      return sortDir === 'asc' ? cmp : -cmp;
    });

    const arrow = (key: SortKey) =>
      sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '';

    const prCheckKey = `pkup-pr-checked:${isoStart}..${isoEnd}`;
    const prChecked: Record<number, boolean> = JSON.parse(localStorage.getItem(prCheckKey) ?? '{}');

    const rows = sorted.map(pr => {
      const from = pr.firstCommitAt.slice(0, 10);
      const to   = pr.mergedAt.slice(0, 10);
      const span = from === to ? from : `${from} → ${to}`;
      const days = Math.round((new Date(pr.mergedAt).getTime() - new Date(pr.firstCommitAt).getTime()) / 86400000) + 1;
      const checked = prChecked[pr.number] ? ' checked' : '';
      return `<tr>
        <td class="pr-col-check"><input type="checkbox" class="pr-check" data-pr="${pr.number}"${checked} /></td>
        <td class="pr-col-repo">${pr.repo}</td>
        <td class="pr-col-title"><a class="pr-link" href="${pr.url}" target="_blank" rel="noopener">#${pr.number} ${pr.title}</a></td>
        <td class="pr-col-span">${span}</td>
        <td class="pr-col-days">${days}</td>
        <td class="pr-col-add pr-additions">+${pr.additions}</td>
        <td class="pr-col-del pr-deletions">−${pr.deletions}</td>
      </tr>`;
    }).join('');

    const totalAdd = prs.reduce((s, p) => s + p.additions, 0);
    const totalDel = prs.reduce((s, p) => s + p.deletions, 0);

    const list = document.createElement('div');
    list.className = 'pr-list';
    list.innerHTML = `
      <div class="pr-list-header">
        Zmergowane PR-y: <strong>${prs.length}</strong>
        <span class="pr-list-totals">
          <span class="pr-additions">+${totalAdd}</span>
          <span class="pr-deletions">−${totalDel}</span>
        </span>
      </div>
      <table class="pr-table">
        <thead>
          <tr>
            <th class="pr-col-check"></th>
            <th class="pr-col-repo">Repo</th>
            <th class="pr-col-title">Pull Request</th>
            <th class="pr-col-span pr-sortable" data-sort="mergedAt">Okres${arrow('mergedAt')}</th>
            <th class="pr-col-days">Ile dni</th>
            <th class="pr-col-add pr-sortable" data-sort="additions">+${arrow('additions')}</th>
            <th class="pr-col-del">−</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;

    function parseTitle(title: string): { jiraId: string; issue: string } {
      const match = title.match(/\b(CA-\d+)\b[^\w]*/i);
      if (!match) return { jiraId: '—', issue: title.trim() };
      const jiraId = match[1].toUpperCase();
      const raw = title.slice(match.index! + match[0].length).trim() || title.trim();
      const issue = raw.charAt(0).toUpperCase() + raw.slice(1);
      return { jiraId, issue };
    }

    function renderPkupTable() {
      main.querySelector('.pkup-report-table')?.remove();
      const checkedPRs = prs.filter(pr => prChecked[pr.number]);

      const hc = Number(main.querySelector('.summary-hc')!.textContent) || 0;
      const totalLines = checkedPRs.reduce((s, p) => s + p.additions, 0);

      // Proportional allocation with largest-remainder fix so sum === hc exactly
      const raw = checkedPRs.map(pr => ({
        pr,
        exact: totalLines > 0 ? (pr.additions / totalLines) * hc : 0,
      }));
      const floors = raw.map(r => Math.floor(r.exact));
      let remainder = hc - floors.reduce((s, h) => s + h, 0);
      const hours = raw
        .map((r, i) => ({ i, frac: r.exact - floors[i] }))
        .sort((a, b) => b.frac - a.frac)
        .reduce((acc, { i }) => { acc[i] = floors[i] + (remainder-- > 0 ? 1 : 0); return acc; }, [] as number[]);

      const reportRows = checkedPRs.map((pr, i) => {
        const { jiraId, issue } = parseTitle(pr.title);
        return `<tr>
          <td class="rpt-col-jira">${jiraId !== '—' ? `<a href="https://acoustic-jiraconf.atlassian.net/browse/${jiraId}" target="_blank" rel="noopener">${jiraId}</a>` : '—'}</td>
          <td class="rpt-col-issue">${issue}</td>
          <td class="rpt-col-hours">${hours[i]}</td>
        </tr>`;
      }).join('');

      const reportData = checkedPRs.map((pr, i) => {
        const { jiraId, issue } = parseTitle(pr.title);
        return { jiraId, issue, hours: hours[i] };
      });
      const totalHours = hours.reduce((s, h) => s + h, 0);

      const table = document.createElement('div');
      table.className = 'pkup-report-table';
      table.innerHTML = `
        <div class="rpt-toolbar">
          <button class="btn-export">Wygeneruj XLS</button>
        </div>
        <table class="pr-table">
          <thead>
            <tr>
              <th class="rpt-col-jira">Jira ID</th>
              <th class="rpt-col-issue">Issue</th>
              <th class="rpt-col-hours">Hours spent</th>
            </tr>
          </thead>
          <tbody>${reportRows}</tbody>
          <tfoot>
            <tr class="rpt-footer">
              <td colspan="2" class="rpt-footer-label">Total</td>
              <td class="rpt-col-hours rpt-footer-total">${totalHours}</td>
            </tr>
          </tfoot>
        </table>`;

      table.querySelector('.btn-export')!.addEventListener('click', () => {
        const monthNum = String(MONTHS.findIndex(m => m.slug === monthSlug) + 1).padStart(2, '0');
        exportXlsx(reportData, year, monthNum, monthSlug, import.meta.env['VITE_USERNAME'] ?? 'pkup', fmtDate(periodStart), fmtDate(periodEnd));
      });

      main.querySelector('.days-table')!.insertAdjacentElement('beforebegin', table);
    }

    list.querySelectorAll<HTMLInputElement>('.pr-check').forEach(cb => {
      cb.addEventListener('change', () => {
        prChecked[Number(cb.dataset['pr'])] = cb.checked;
        localStorage.setItem(prCheckKey, JSON.stringify(prChecked));
        renderPkupTable();
      });
    });

    list.querySelectorAll<HTMLElement>('.pr-sortable').forEach(th => {
      th.addEventListener('click', () => {
        const key = th.dataset['sort'] as SortKey;
        if (sortKey === key) {
          sortDir = sortDir === 'asc' ? 'desc' : 'asc';
        } else {
          sortKey = key;
          sortDir = 'desc';
        }
        renderPRList(prs);
      });
    });

    main.querySelector('.days-table')!.insertAdjacentElement('beforebegin', list);
    rerenderPkupTable = renderPkupTable;
    renderPkupTable();
  }

  const toolbar = main.querySelector('.table-toolbar')!;

  const btnReload = document.createElement('button');
  btnReload.className = 'btn-reload';
  btnReload.title = 'Odśwież dane z GitHub';
  btnReload.innerHTML = '↻';
  btnReload.style.display = 'none';
  toolbar.appendChild(btnReload);

  function setLoaded(count: number) {
    btnGithub.disabled = true;
    btnGithub.textContent = `Sprawdź Githuba (${count})`;
    btnReload.style.display = '';
  }

  async function doFetch() {
    btnGithub.disabled = true;
    btnReload.disabled = true;
    btnReload.classList.add('btn-reload--spinning');
    const prev = btnGithub.textContent;
    btnGithub.textContent = 'Ładowanie…';
    try {
      const prs = await fetchPRs(isoStart, isoEnd);
      renderPRList(prs);
      setLoaded(prs.length);
    } catch (err) {
      btnGithub.textContent = prev ?? 'Sprawdź Githuba';
      btnGithub.disabled = false;
      renderPRError(String(err));
    } finally {
      btnReload.disabled = false;
      btnReload.classList.remove('btn-reload--spinning');
    }
  }

  const cached = loadPRs(isoStart, isoEnd);
  if (cached) {
    renderPRList(cached);
    setLoaded(cached.length);
  } else {
    btnGithub.removeAttribute('disabled');
    btnGithub.style.opacity = '1';
    btnGithub.style.cursor = 'pointer';
  }

  btnGithub.addEventListener('click', doFetch);
  btnReload.addEventListener('click', doFetch);

  const state = { ...saved };

  main.querySelectorAll<HTMLInputElement>('.day-check').forEach(cb => {
    cb.addEventListener('change', e => {
      const clicked = e.currentTarget as HTMLInputElement;
      const row = clicked.closest<HTMLElement>('tr[data-iso]')!;
      const iso = row.dataset['iso']!;

      if (clicked.checked) {
        row.querySelectorAll<HTMLInputElement>('.day-check').forEach(other => {
          if (other !== clicked) other.checked = false;
        });
        state[iso] = clicked.dataset['type'] as DayType;
      } else {
        delete state[iso];
      }

      saveState(year, monthSlug, state);
      updateSummary();
    });
  });

  updateSummary();
  rerenderPkupTable();
}

async function render() {
  const { year, month } = parseRoute();

  document.querySelectorAll<HTMLElement>('.tabs--years .tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset['year'] === String(year));
  });
  document.querySelectorAll<HTMLElement>('.tabs--months .tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset['month'] === month);
  });

  // Load holidays for the range (December bleeds into next year)
  const monthIndex = MONTHS.findIndex(m => m.slug === month);
  const nextYear = monthIndex === 11 ? year + 1 : year;
  await Promise.all([loadHolidays(year), loadHolidays(nextYear)]);

  renderDays(year, month);
}

document.querySelectorAll<HTMLElement>('.tabs--years .tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const { month } = parseRoute();
    navigate(Number(tab.dataset['year']), month);
  });
});
document.querySelectorAll<HTMLElement>('.tabs--months .tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const { year } = parseRoute();
    navigate(year, tab.dataset['month']!);
  });
});

window.addEventListener('popstate', render);

if (window.location.pathname === '/') {
  const now = new Date();
  const defaultMonth = MONTHS[now.getMonth()].slug;
  const defaultYear = YEARS.includes(now.getFullYear()) ? now.getFullYear() : YEARS[0];
  history.replaceState(null, '', `/${defaultYear}/${defaultMonth}`);
}

render();
