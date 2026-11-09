import React, { useEffect, useMemo, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import population from '../../ngc_population.json'
import './style.css'

const PAGE_SIZE = 25
const designations = ['Всички', 'PF', 'MS']

const numberFormatter = new Intl.NumberFormat('bg-BG')

function getPopulationCount(coin) {
  return coin['Population Total'] ?? coin.Grades.reduce((sum, grade) => sum + grade.Count, 0)
}

function getCoinPeriod(coinName) {
  const match = coinName.match(/^\s*(?:\((\d{3,4}(?:\s*[-–]\s*\d{1,4})?)\)|(\d{3,4}))/)
  return (match?.[1] ?? match?.[2] ?? 'Недатирана').replace(/\s*[-–]\s*/, '-')
}

function hasValue(value) {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function formatModifiedDate(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? value
    : new Intl.DateTimeFormat('bg-BG', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
}

function getPeriodSortValue(period) {
  const year = Number.parseInt(period, 10)
  return Number.isNaN(year) ? Number.POSITIVE_INFINITY : year
}

function App() {
  const [query, setQuery] = useState('')
  const [designation, setDesignation] = useState('Всички')
  const [group, setGroup] = useState('Всички')
  const [period, setPeriod] = useState('Всички')
  const [periodSort, setPeriodSort] = useState('asc')
  const [page, setPage] = useState(1)
  const [expandedCoin, setExpandedCoin] = useState(null)
  const [statisticsOpen, setStatisticsOpen] = useState(false)
  const statisticsDialog = useRef(null)

  const groups = useMemo(
    () => [...new Set(population.map((coin) => coin.GroupID))].sort((a, b) => a - b),
    [],
  )
  const periods = useMemo(
    () => [...new Set(population.map((coin) => getCoinPeriod(coin['Coin Name'])))]
      .sort((a, b) => getPeriodSortValue(a) - getPeriodSortValue(b) || a.localeCompare(b)),
    [],
  )

  const statistics = useMemo(() => {
    const gradeTotals = new Map()
    let specimenCount = 0

    for (const coin of population) {
      specimenCount += getPopulationCount(coin)
      for (const grade of coin.Grades) {
        gradeTotals.set(grade.Grade, (gradeTotals.get(grade.Grade) ?? 0) + grade.Count)
      }
    }

    const topGrades = [...gradeTotals.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .slice(0, 8)

    return { specimenCount, topGrades }
  }, [])

  const filteredCoins = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('bg')

    return population.filter((coin) => {
      const matchesDesignation = designation === 'Всички' || coin.Designation === designation
      const matchesGroup = group === 'Всички' || String(coin.GroupID) === group
      const coinPeriod = getCoinPeriod(coin['Coin Name'])
      const matchesPeriod = period === 'Всички' || coinPeriod === period
      const searchableText = [
        coinPeriod,
        ...Object.values(coin)
          .filter((value) => ['string', 'number', 'boolean'].includes(typeof value)),
        ...coin.Grades.map((grade) => grade.Grade),
      ]
        .join(' ')
        .toLocaleLowerCase('bg')

      return (
        matchesDesignation &&
        matchesGroup &&
        matchesPeriod &&
        (!normalizedQuery || searchableText.includes(normalizedQuery))
      )
    })
  }, [designation, group, period, query])

  const sortedCoins = useMemo(
    () => [...filteredCoins].sort((a, b) => {
      const aPeriod = getPeriodSortValue(getCoinPeriod(a['Coin Name']))
      const bPeriod = getPeriodSortValue(getCoinPeriod(b['Coin Name']))
      if (!Number.isFinite(aPeriod)) return Number.isFinite(bPeriod) ? 1 : a['Coin Name'].localeCompare(b['Coin Name'])
      if (!Number.isFinite(bPeriod)) return -1
      if (aPeriod !== bPeriod) {
        return periodSort === 'asc' ? aPeriod - bPeriod : bPeriod - aPeriod
      }
      return a['Coin Name'].localeCompare(b['Coin Name'])
    }),
    [filteredCoins, periodSort],
  )

  const pageCount = Math.max(1, Math.ceil(sortedCoins.length / PAGE_SIZE))
  const currentPage = Math.min(page, pageCount)
  const visibleCoins = sortedCoins.slice(
    (currentPage - 1) * PAGE_SIZE,
    currentPage * PAGE_SIZE,
  )
  const periodCounts = useMemo(
    () => sortedCoins.reduce((counts, coin) => {
      const coinPeriod = getCoinPeriod(coin['Coin Name'])
      counts.set(coinPeriod, (counts.get(coinPeriod) ?? 0) + 1)
      return counts
    }, new Map()),
    [sortedCoins],
  )
  const maxGradeCount = statistics.topGrades[0]?.[1] ?? 1

  useEffect(() => {
    if (statisticsOpen && statisticsDialog.current && !statisticsDialog.current.open) {
      statisticsDialog.current.showModal()
    }
  }, [statisticsOpen])

  function resetPage(update) {
    setPage(1)
    update()
  }

  return (
    <main className="page-shell">
      <div className="page-tools">
        <button
          className="info-trigger"
          type="button"
          onClick={() => setStatisticsOpen(true)}
          aria-label="Покажи обобщението на данните"
          aria-haspopup="dialog"
          aria-expanded={statisticsOpen}
        >
          <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" />
            <path d="M12 11v5m0-8h.01" />
          </svg>
        </button>
      </div>

      {statisticsOpen && (
        <dialog
          className="statistics-dialog"
          ref={statisticsDialog}
          aria-labelledby="statistics-title"
          onClose={() => setStatisticsOpen(false)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              statisticsDialog.current.close()
            }
          }}
          onClick={(event) => {
            if (event.target === statisticsDialog.current) {
              statisticsDialog.current.close()
            }
          }}
        >
          <div className="statistics-dialog-header">
            <div>
              <span className="eyebrow">ОБЩ ПОГЛЕД</span>
              <h2 id="statistics-title">Обобщение на данните</h2>
            </div>
            <button
              className="statistics-dialog-close"
              type="button"
              onClick={() => statisticsDialog.current?.close()}
              aria-label="Затвори обобщението"
              autoFocus
            >
              <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                <path d="m6 6 12 12M18 6 6 18" />
              </svg>
            </button>
          </div>
          <section className="stats-grid" aria-label="Обобщение на данните">
            <article className="stat-card">
              <span className="stat-label">Монети в каталога</span>
              <strong>{numberFormatter.format(population.length)}</strong>
              <span className="stat-caption">индивидуални записа</span>
            </article>
            <article className="stat-card">
              <span className="stat-label">Нумизматични групи</span>
              <strong>{numberFormatter.format(groups.length)}</strong>
              <span className="stat-caption">каталожни категории</span>
            </article>
            <article className="stat-card stat-card-accent">
              <span className="stat-label">Сертифицирани екземпляри</span>
              <strong>{numberFormatter.format(statistics.specimenCount)}</strong>
              <span className="stat-caption">сбор на отчетената популация</span>
            </article>
          </section>
          <section className="distribution-panel">
            <div className="section-heading">
              <div>
                <div className="eyebrow">РАЗПРЕДЕЛЕНИЕ</div>
                <h2>Най-чести оценки</h2>
              </div>
              <span className="section-note">по брой сертифицирани екземпляри</span>
            </div>
            <div className="grade-chart">
              {statistics.topGrades.map(([grade, count]) => (
                <div className="grade-row" key={grade}>
                  <span className="grade-name">{grade}</span>
                  <div
                    className="grade-track"
                    role="img"
                    aria-label={`${grade}: ${numberFormatter.format(count)} екземпляра`}
                  >
                    <span style={{ width: `${(count / maxGradeCount) * 100}%` }} />
                  </div>
                  <span className="grade-count">{numberFormatter.format(count)}</span>
                </div>
              ))}
            </div>
          </section>
        </dialog>
      )}

      <section className="catalog-section">
        <div className="section-heading catalog-heading">
          <span className="result-count">
            {numberFormatter.format(filteredCoins.length)} {filteredCoins.length === 1 ? 'резултат' : 'резултата'}
          </span>
        </div>

        <div className="filters">
          <label className="search-field">
            <span className="search-icon" aria-hidden="true">⌕</span>
            <input
              type="search"
              placeholder="Търси монета, оценка, година или характеристика..."
              value={query}
              onChange={(event) => resetPage(() => setQuery(event.target.value))}
              aria-label="Търсене в каталога"
            />
            {query && (
              <button
                className="clear-search"
                type="button"
                onClick={() => resetPage(() => setQuery(''))}
                aria-label="Изчисти търсенето"
              >
                ×
              </button>
            )}
          </label>

          <div className="filter-tabs" role="group" aria-label="Филтър по обозначение">
            {designations.map((item) => (
              <button
                className={designation === item ? 'filter-tab active' : 'filter-tab'}
                key={item}
                type="button"
                onClick={() => resetPage(() => setDesignation(item))}
                aria-pressed={designation === item}
              >
                {item}
              </button>
            ))}
          </div>

          <label className="group-select">
            <span>Група</span>
            <select
              value={group}
              onChange={(event) => resetPage(() => setGroup(event.target.value))}
              aria-label="Филтър по група"
            >
              <option value="Всички">Всички</option>
              {groups.map((groupId) => (
                <option key={groupId} value={groupId}>#{groupId}</option>
              ))}
            </select>
          </label>

          <label className="group-select period-select">
            <span>Година</span>
            <select
              value={period}
              onChange={(event) => resetPage(() => setPeriod(event.target.value))}
              aria-label="Филтър по година или период"
            >
              <option value="Всички">Всички</option>
              {periods.map((coinPeriod) => (
                <option key={coinPeriod} value={coinPeriod}>{coinPeriod}</option>
              ))}
            </select>
          </label>
        </div>

        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">МОНЕТА</th>
                <th scope="col">
                  <button
                    className="sort-button"
                    type="button"
                    onClick={() => {
                      setPeriodSort(periodSort === 'asc' ? 'desc' : 'asc')
                      setPage(1)
                    }}
                    aria-label={`Сортирай ${periodSort === 'asc' ? 'от най-новата' : 'от най-старата'} година`}
                    aria-sort={periodSort === 'asc' ? 'ascending' : 'descending'}
                  >
                    ГОДИНА / ПЕРИОД <span aria-hidden="true">{periodSort === 'asc' ? '↑' : '↓'}</span>
                  </button>
                </th>
                <th scope="col">ГРУПА</th>
                <th scope="col">ТИП</th>
                <th scope="col">ОЦЕНКИ</th>
                <th scope="col" className="number-column">ЕКЗЕМПЛЯРИ</th>
                <th scope="col"><span className="sr-only">Детайли</span></th>
              </tr>
            </thead>
            <tbody>
              {visibleCoins.flatMap((coin, index) => {
                const coinKey = `${coin.GroupID}-${coin.Designation}-${coin['Coin Name']}`
                const isExpanded = expandedCoin === coinKey
                const coinPeriod = getCoinPeriod(coin['Coin Name'])
                const previousCoin = visibleCoins[index - 1]
                const startsPeriod = !previousCoin ||
                  getCoinPeriod(previousCoin['Coin Name']) !== coinPeriod

                return [
                  ...(startsPeriod
                    ? [(
                      <tr className="period-group-row" key={`period-${coinPeriod}`}>
                        <th colSpan="7" scope="rowgroup">
                          <span>{coinPeriod}</span>
                          <span className="period-group-count">
                            {numberFormatter.format(periodCounts.get(coinPeriod) ?? 0)} {periodCounts.get(coinPeriod) === 1 ? 'монета' : 'монети'}
                          </span>
                        </th>
                      </tr>
                    )]
                    : []),
                  <CoinRow
                    coin={coin}
                    key={coinKey}
                    number={(currentPage - 1) * PAGE_SIZE + index + 1}
                    period={coinPeriod}
                    isExpanded={isExpanded}
                    onToggle={() => setExpandedCoin(isExpanded ? null : coinKey)}
                  />,
                ]
              })}
              {visibleCoins.length === 0 && (
                <tr>
                  <td className="empty-state" colSpan="7">
                    <span className="empty-icon">⌕</span>
                    <strong>Няма намерени монети</strong>
                    <span>Промени търсенето или избраните филтри.</span>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="table-footer">
          <span>Показани {visibleCoins.length ? (currentPage - 1) * PAGE_SIZE + 1 : 0}–{Math.min(currentPage * PAGE_SIZE, sortedCoins.length)} от {numberFormatter.format(sortedCoins.length)}</span>
          <div className="pagination">
            <button
              type="button"
              onClick={() => setPage(currentPage - 1)}
              disabled={currentPage === 1}
              aria-label="Предишна страница"
            >
              ←
            </button>
            <span>{currentPage} <span className="page-divider">/</span> {pageCount}</span>
            <button
              type="button"
              onClick={() => setPage(currentPage + 1)}
              disabled={currentPage === pageCount}
              aria-label="Следваща страница"
            >
              →
            </button>
          </div>
        </footer>
      </section>

      <footer className="page-footer">
        <span>NGC POPULATION REPORT</span>
        <span>Информацията е представена според подадения набор от данни.</span>
      </footer>
    </main>
  )
}

function CoinRow({ coin, number, period, isExpanded, onToggle }) {
  const shownGrades = coin.Grades.slice(0, 3)
  const remainingGrades = coin.Grades.length - shownGrades.length
  const metadata = [
    ['Година', coin.Year],
    ['Нумерична година', coin['Numeric Year']],
    ['Номинал', coin.Denomination],
    ['Монетен знак', coin['Mint Mark']],
    ['Изработка', coin.Strike],
    ['Разновидност', coin.Variety],
    ['Код на етикет', coin['Label Code']],
    ['Базова монета', coin['Is Base Coin']],
    ['Монета разновидност', coin['Is Variety Coin']],
    ['Монета с етикет', coin['Is Label Coin']],
    ['Coin ID', coin['Coin ID']],
    ['Population ID', coin['Population ID']],
    ['Universal Coin Type ID', coin['Universal Coin Type ID']],
    ['Sum Number ID', coin['Sum Number ID']],
    ['Каталожен номер Krause', coin['Krause Number']],
    ['Референция', coin['Coin Reference']],
    ['Обща популация', coin['Population Total'] == null
      ? null
      : numberFormatter.format(coin['Population Total'])],
    ['Последна промяна', hasValue(coin['Date Modified'])
      ? formatModifiedDate(coin['Date Modified'])
      : null],
  ]
    .filter(([, value]) => hasValue(value))
    .map(([label, value]) => [
      label,
      typeof value === 'boolean' ? (value ? 'Да' : 'Не') : value,
    ])
  const images = [
    ['Лице', coin['Obverse Image']],
    ['Гръб', coin['Reverse Image']],
  ].filter(([, image]) => hasValue(image))

  return (
    <>
      <tr className={isExpanded ? 'coin-row expanded' : 'coin-row'}>
        <td>
          <div className="coin-name">
            <span className="row-number">{String(number).padStart(2, '0')}</span>
            <span>{coin['Coin Name']}</span>
          </div>
        </td>
        <td><span className={period === 'Недатирана' ? 'period-badge undated' : 'period-badge'}>{period}</span></td>
        <td><span className="group-badge">#{coin.GroupID}</span></td>
        <td><span className={`designation-badge ${coin.Designation.toLowerCase()}`}>{coin.Designation}</span></td>
        <td>
          <div className="grade-pills">
            {shownGrades.map((grade) => (
              <span className="grade-pill" key={grade.Grade}>{grade.Grade}</span>
            ))}
            {remainingGrades > 0 && <span className="more-grades">+{remainingGrades}</span>}
          </div>
        </td>
        <td className="number-column population-value">{numberFormatter.format(getPopulationCount(coin))}</td>
        <td className="details-cell">
          <button
            type="button"
            className="details-button"
            onClick={onToggle}
            aria-expanded={isExpanded}
            aria-label={`${isExpanded ? 'Скрий' : 'Покажи'} оценките за ${coin['Coin Name']}`}
          >
            {isExpanded ? '−' : '+'}
          </button>
        </td>
      </tr>
      {isExpanded && (
        <tr className="detail-row">
          <td colSpan="7">
            <div className="detail-content">
              <div className="detail-section">
                <span className="detail-label">РАЗБИВКА ПО ОЦЕНКА</span>
                <div className="detail-grades">
                  {coin.Grades.map((grade) => (
                    <span className="detail-grade" key={grade.Grade}>
                      <strong>{grade.Grade}</strong>
                      <span>{numberFormatter.format(grade.Count)}</span>
                    </span>
                  ))}
                </div>
              </div>
              {hasValue(coin.Description) && (
                <p className="coin-description">{coin.Description}</p>
              )}
              {metadata.length > 0 && (
                <dl className="coin-metadata">
                  {metadata.map(([label, value]) => (
                    <div className="metadata-item" key={label}>
                      <dt>{label}</dt>
                      <dd>{value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              {images.length > 0 && (
                <div className="coin-images">
                  {images.map(([label, image]) => (
                    <figure className="coin-image" key={label}>
                      <img src={image} alt={`${label} на монетата ${coin['Coin Name']}`} loading="lazy" />
                      <figcaption>{label}</figcaption>
                    </figure>
                  ))}
                </div>
              )}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

createRoot(document.getElementById('app')).render(<App />)
