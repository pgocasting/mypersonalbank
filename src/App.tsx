import { useEffect, useState, type FormEvent } from 'react'
import './App.css'

type User = {
  name: string
}

type Transaction = {
  id: string
  date: string
  description: string
  amount: number
  category: string
  scope?: 'checking' | 'savings' | 'both'
}

type BankingData = {
  checkingBalance: number
  savingsBalance: number
  savingsGoal: number | null
  transactions: Transaction[]
}

type MobilePage = 'recent' | 'checking' | 'savings' | 'goals'

const SESSION_KEY = 'mpb.session.v1'
const DATA_KEY = 'mpb.data.v1'

function todayISO() {
  const d = new Date()
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}

function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function formatMoney(amount: number) {
  return new Intl.NumberFormat(undefined, {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(amount)
}

function App() {
  const [user, setUser] = useState<User | null>(null)
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const savedSession = localStorage.getItem(SESSION_KEY)
    if (!savedSession) return
    try {
      const parsed = JSON.parse(savedSession) as User
      if (parsed?.name) setUser({ name: parsed.name })
    } catch {
      localStorage.removeItem(SESSION_KEY)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !('matchMedia' in window)) return
    const mql = window.matchMedia('(max-width: 520px)')

    const onChange = () => setIsMobile(mql.matches)
    onChange()
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  const emptyData: BankingData = {
    checkingBalance: 0,
    savingsBalance: 0,
    savingsGoal: null,
    transactions: [],
  }

  const [data, setData] = useState<BankingData>(emptyData)
  const [isInitialLoad, setIsInitialLoad] = useState(true)

  useEffect(() => {
    const raw = localStorage.getItem(DATA_KEY)
    console.log('[App] Load from localStorage:', raw)
    if (!raw) {
      console.log('[App] No data in localStorage, staying empty')
      setIsInitialLoad(false)
      return
    }
    try {
      const parsed = JSON.parse(raw) as BankingData
      if (
        typeof parsed?.checkingBalance === 'number' &&
        typeof parsed?.savingsBalance === 'number' &&
        Array.isArray(parsed?.transactions)
      ) {
        console.log('[App] Parsed data from localStorage:', parsed)
        setData({
          checkingBalance: parsed.checkingBalance,
          savingsBalance: parsed.savingsBalance,
          savingsGoal: typeof parsed.savingsGoal === 'number' ? parsed.savingsGoal : null,
          transactions: parsed.transactions,
        })
      } else {
        console.warn('[App] Invalid data shape in localStorage, ignoring')
      }
    } catch (e) {
      console.error('[App] Failed to parse localStorage data:', e)
      localStorage.removeItem(DATA_KEY)
    }
    setIsInitialLoad(false)
  }, [])

  useEffect(() => {
    if (isInitialLoad) return // Don't save the initial empty state
    console.log('[App] Saving to localStorage:', data)
    localStorage.setItem(DATA_KEY, JSON.stringify(data))
  }, [data, isInitialLoad])

  const transactions = data.transactions
  const checkingBalance = data.checkingBalance
  const savingsBalance = data.savingsBalance
  const totalBalance = checkingBalance + savingsBalance

  type ModalType =
    | 'transfer'
    | 'payBills'
    | 'addMoney'
    | 'setGoal'
    | 'settings'
    | 'editChecking'
    | 'editSavings'
    | 'txDetails'
  const [modal, setModal] = useState<ModalType | null>(null)
  const [modalError, setModalError] = useState<string | null>(null)
  const [amountInput, setAmountInput] = useState('')
  const [descriptionInput, setDescriptionInput] = useState('')
  const [isMobile, setIsMobile] = useState(false)
  const [mobilePage, setMobilePage] = useState<MobilePage>('recent')
  const [selectedTransaction, setSelectedTransaction] = useState<Transaction | null>(null)
  const [transferDirection, setTransferDirection] = useState<'checkingToSavings' | 'savingsToChecking'>(
    'checkingToSavings',
  )

  function openModal(type: ModalType) {
    setModal(type)
    setModalError(null)
    setAmountInput('')
    setDescriptionInput('')
    setTransferDirection('checkingToSavings')
  }

  function openTransactionDetails(tx: Transaction) {
    setSelectedTransaction(tx)
    setModal('txDetails')
  }

  function closeModal() {
    setModal(null)
    setModalError(null)
    setSelectedTransaction(null)
  }

  function parseAmount(raw: string) {
    const cleaned = raw.replace(/,/g, '').trim()
    const n = Number.parseFloat(cleaned)
    if (!Number.isFinite(n) || n <= 0) return null
    return Math.round(n * 100) / 100
  }

  function addTransaction(tx: Omit<Transaction, 'id' | 'date'> & Partial<Pick<Transaction, 'date'>>) {
    const date = tx.date ?? todayISO()
    const full: Transaction = {
      id: makeId(),
      date,
      description: tx.description,
      amount: tx.amount,
      category: tx.category,
      scope: tx.scope,
    }
    setData((prev) => ({
      ...prev,
      transactions: [full, ...prev.transactions].slice(0, 25),
    }))
  }

  function transactionMatchesScope(tx: Transaction, scope: 'checking' | 'savings' | 'both') {
    const s = tx.scope ?? 'both'
    return s === 'both' || s === scope
  }

  function onConfirmTransfer() {
    setModalError(null)
    const amount = parseAmount(amountInput)
    if (amount === null) {
      setModalError('Enter a valid amount.')
      return
    }

    if (transferDirection === 'checkingToSavings') {
      if (amount > data.checkingBalance) {
        setModalError('Not enough funds in Checking.')
        return
      }
      setData((prev) => ({
        ...prev,
        checkingBalance: Math.round((prev.checkingBalance - amount) * 100) / 100,
        savingsBalance: Math.round((prev.savingsBalance + amount) * 100) / 100,
      }))
      addTransaction({ description: 'Transfer to Savings', amount: -amount, category: 'Transfer', scope: 'both' })
    } else {
      if (amount > data.savingsBalance) {
        setModalError('Not enough funds in Savings.')
        return
      }
      setData((prev) => ({
        ...prev,
        savingsBalance: Math.round((prev.savingsBalance - amount) * 100) / 100,
        checkingBalance: Math.round((prev.checkingBalance + amount) * 100) / 100,
      }))
      addTransaction({ description: 'Transfer to Checking', amount: amount, category: 'Transfer', scope: 'both' })
    }

    closeModal()
  }

  function onConfirmPayBills() {
    setModalError(null)
    const amount = parseAmount(amountInput)
    const desc = descriptionInput.trim()
    if (!desc) {
      setModalError('Enter a bill name/description.')
      return
    }
    if (amount === null) {
      setModalError('Enter a valid amount.')
      return
    }
    if (amount > data.checkingBalance) {
      setModalError('Not enough funds in Checking.')
      return
    }

    setData((prev) => ({
      ...prev,
      checkingBalance: Math.round((prev.checkingBalance - amount) * 100) / 100,
    }))
    addTransaction({ description: `Bill Payment: ${desc}`, amount: -amount, category: 'Bills', scope: 'checking' })
    closeModal()
  }

  function onConfirmAddMoney() {
    setModalError(null)
    const amount = parseAmount(amountInput)
    if (amount === null) {
      setModalError('Enter a valid amount.')
      return
    }

    setData((prev) => ({
      ...prev,
      savingsBalance: Math.round((prev.savingsBalance + amount) * 100) / 100,
    }))
    addTransaction({ description: 'Add Money to Savings', amount: amount, category: 'Income', scope: 'savings' })
    closeModal()
  }

  function onConfirmSetGoal() {
    setModalError(null)
    const amount = parseAmount(amountInput)
    if (amount === null) {
      setModalError('Enter a valid goal amount.')
      return
    }
    setData((prev) => ({ ...prev, savingsGoal: amount }))
    addTransaction({ description: 'Set savings goal', amount: 0, category: 'Goal', scope: 'savings' })
    closeModal()
  }

  function onConfirmEditChecking() {
    setModalError(null)
    const amount = parseAmount(amountInput)
    if (amount === null) {
      setModalError('Enter a valid balance.')
      return
    }
    const diff = amount - checkingBalance
    addTransaction({
      description: 'Balance correction',
      amount: diff,
      category: 'Adjustment',
      scope: 'checking',
    })
    setData((prev) => ({ ...prev, checkingBalance: amount }))
    closeModal()
  }

  function onConfirmEditSavings() {
    setModalError(null)
    const amount = parseAmount(amountInput)
    if (amount === null) {
      setModalError('Enter a valid balance.')
      return
    }
    const diff = amount - savingsBalance
    addTransaction({
      description: 'Balance correction',
      amount: diff,
      category: 'Adjustment',
      scope: 'savings',
    })
    setData((prev) => ({ ...prev, savingsBalance: amount }))
    closeModal()
  }

  function onClearAllData() {
    if (!confirm('This will reset all balances, transactions, and goals. Are you sure?')) return
    setData(emptyData)
    // Force save to localStorage immediately so it persists after refresh
    localStorage.setItem(DATA_KEY, JSON.stringify(emptyData))
    closeModal()
  }

  function onExportData() {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `mpb-data-${todayISO()}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function onLogin(e: FormEvent) {
    e.preventDefault()
    setError(null)

    const u = username.trim()
    const p = password

    if (!u || !p) {
      setError('Please enter username and password.')
      return
    }

    if (u !== 'Admin' || p !== 'admin123') {
      setError('Invalid login. Use Admin / admin123.')
      return
    }

    const sessionUser: User = { name: 'Admin' }
    localStorage.setItem(SESSION_KEY, JSON.stringify(sessionUser))
    setUser(sessionUser)
    setUsername('')
    setPassword('')
  }

  function onLogout() {
    localStorage.removeItem(SESSION_KEY)
    setUser(null)
  }

  function onSelectMobilePage(page: MobilePage) {
    setMobilePage(page)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (!user) {
    return (
      <div className="auth-shell">
        <div className="auth-card">
          <div className="auth-brand">
            <div className="auth-logo">
              <img className="auth-logo-img" src="/Images/Logobank.png" alt="Bank logo" />
            </div>
            <div>
              <div className="auth-title">My Personal Bank</div>
              <div className="auth-subtitle">Sign in to your account</div>
            </div>
          </div>

          <form className="auth-form" onSubmit={onLogin}>
            <label className="field">
              <span>Username</span>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="Please enter username"
                autoComplete="username"
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Please enter password"
                autoComplete="current-password"
              />
            </label>

            {error ? <div className="auth-error">{error}</div> : null}

            <button className="primary" type="submit">
              Sign in
            </button>
          </form>
        </div>
      </div>
    )
  }

  return (
    <div className={isMobile && mobilePage === 'recent' ? 'app-shell lock-scroll' : 'app-shell'}>
      <header className="topbar">
        <div className="topbar-left">
          <div className="brand">My Personal Bank</div>
          <div className="tag">Secure dashboard</div>
        </div>
        <div className="topbar-right">
          <div className="user-chip">
            <div className="avatar">{user.name.slice(0, 1).toUpperCase()}</div>
            <div className="user-name">{user.name}</div>
          </div>
          <button className="ghost" onClick={() => openModal('settings')}>
            Settings
          </button>
          <button className="ghost" onClick={onLogout}>
            Logout
          </button>
        </div>
      </header>

      <main className={isMobile ? `container mobile-main page-${mobilePage}` : 'container'}>
        {isMobile ? (
          <section className="grid grid-full">
            {mobilePage === 'checking' ? (
              <>
                <div className="card card-wide" id="section-checking">
                  <div className="card-head">
                    <div>
                      <div className="card-title">Checking</div>
                      <div className="card-subtitle">Everyday spending</div>
                    </div>
                    <div className="pill">••• 2934</div>
                  </div>
                  <div className="card-value">{formatMoney(checkingBalance)}</div>
                  <div className="card-foot">
                    <button className="secondary" type="button" onClick={() => openModal('transfer')}>
                      Transfer
                    </button>
                    <button className="secondary" type="button" onClick={() => openModal('payBills')}>
                      Pay bills
                    </button>
                    <button className="secondary" type="button" onClick={() => openModal('editChecking')}>
                      Edit balance
                    </button>
                  </div>
                </div>

                <div className="card card-wide">
                  <div className="card-head">
                    <div>
                      <div className="card-title">History</div>
                      <div className="card-subtitle">Checking activity</div>
                    </div>
                  </div>

                  {transactions.filter(
                    (t) =>
                      (t.category === 'Transfer' || t.category === 'Bills' || t.category === 'Adjustment') &&
                      transactionMatchesScope(t, 'checking'),
                  ).length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon">📄</div>
                      <div className="empty-title">No history yet</div>
                      <div className="empty-subtitle">Transfers, bill payments, and edits will appear here</div>
                    </div>
                  ) : (
                    <div className="table history">
                      <div className="row header">
                        <div>Date</div>
                        <div>Description</div>
                        <div>View</div>
                      </div>
                      {transactions
                        .filter(
                          (t) =>
                            (t.category === 'Transfer' || t.category === 'Bills' || t.category === 'Adjustment') &&
                            transactionMatchesScope(t, 'checking'),
                        )
                        .map((t) => (
                          <div key={t.id} className="row">
                            <div className="mono">{t.date}</div>
                            <div>{t.description}</div>
                            <div className="right">
                              <button className="secondary" type="button" onClick={() => openTransactionDetails(t)}>
                                View
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </>
            ) : null}

            {mobilePage === 'savings' ? (
              <>
                <div className="card card-wide" id="section-savings">
                  <div className="card-head">
                    <div>
                      <div className="card-title">Savings</div>
                      <div className="card-subtitle">Emergency fund</div>
                    </div>
                    <div className="pill">••• 2934</div>
                  </div>
                  <div className="card-value">{formatMoney(savingsBalance)}</div>
                  <div className="card-foot">
                    <button className="secondary" type="button" onClick={() => openModal('addMoney')}>
                      Add money
                    </button>
                    <button className="secondary" type="button" onClick={() => openModal('setGoal')}>
                      Set goal
                    </button>
                    <button className="secondary" type="button" onClick={() => openModal('editSavings')}>
                      Edit balance
                    </button>
                  </div>
                </div>

                <div className="card card-wide">
                  <div className="card-head">
                    <div>
                      <div className="card-title">History</div>
                      <div className="card-subtitle">Savings activity</div>
                    </div>
                  </div>

                  {transactions.filter(
                    (t) =>
                      (t.category === 'Transfer' ||
                        t.category === 'Income' ||
                        t.category === 'Goal' ||
                        t.category === 'Adjustment') &&
                      transactionMatchesScope(t, 'savings'),
                  ).length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon">📄</div>
                      <div className="empty-title">No history yet</div>
                      <div className="empty-subtitle">Adds, transfers, goals, and edits will appear here</div>
                    </div>
                  ) : (
                    <div className="table history">
                      <div className="row header">
                        <div>Date</div>
                        <div>Description</div>
                        <div>View</div>
                      </div>
                      {transactions
                        .filter(
                          (t) =>
                            (t.category === 'Transfer' ||
                              t.category === 'Income' ||
                              t.category === 'Goal' ||
                              t.category === 'Adjustment') &&
                            transactionMatchesScope(t, 'savings'),
                        )
                        .map((t) => (
                          <div key={t.id} className="row">
                            <div className="mono">{t.date}</div>
                            <div>{t.description}</div>
                            <div className="right">
                              <button className="secondary" type="button" onClick={() => openTransactionDetails(t)}>
                                View
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </>
            ) : null}

            {mobilePage === 'goals' ? (
              <>
                {data.savingsGoal ? (
                  <div className="card card-wide" id="section-savings-goal">
                    <div className="card-head">
                      <div>
                        <div className="card-title">Savings goal</div>
                        <div className="card-subtitle">Target: {formatMoney(data.savingsGoal)}</div>
                      </div>
                      <div className="pill">
                        {Math.min(100, Math.round((savingsBalance / data.savingsGoal) * 100))}%
                      </div>
                    </div>
                    <div className="goal-bar">
                      <div
                        className="goal-fill"
                        style={{ width: `${Math.min(100, (savingsBalance / data.savingsGoal) * 100)}%` }}
                      />
                    </div>
                    <div className="goal-foot muted">
                      {formatMoney(savingsBalance)} of {formatMoney(data.savingsGoal)}
                    </div>
                  </div>
                ) : (
                  <div className="card card-wide" id="section-savings-goal">
                    <div className="card-head">
                      <div>
                        <div className="card-title">Savings goal</div>
                        <div className="card-subtitle">No goal set</div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="card card-wide">
                  <div className="card-head">
                    <div>
                      <div className="card-title">History</div>
                      <div className="card-subtitle">Goal changes</div>
                    </div>
                  </div>

                  {transactions.filter((t) => t.category === 'Goal').length === 0 ? (
                    <div className="empty-state">
                      <div className="empty-icon">📄</div>
                      <div className="empty-title">No goal history yet</div>
                      <div className="empty-subtitle">Goal updates will appear here</div>
                    </div>
                  ) : (
                    <div className="table history">
                      <div className="row header">
                        <div>Date</div>
                        <div>Description</div>
                        <div>View</div>
                      </div>
                      {transactions
                        .filter((t) => t.category === 'Goal')
                        .map((t) => (
                          <div key={t.id} className="row">
                            <div className="mono">{t.date}</div>
                            <div>{t.description}</div>
                            <div className="right">
                              <button className="secondary" type="button" onClick={() => openTransactionDetails(t)}>
                                View
                              </button>
                            </div>
                          </div>
                        ))}
                    </div>
                  )}
                </div>
              </>
            ) : null}

            {mobilePage === 'recent' ? (
              <div className="card card-wide" id="section-transactions">
                <div className="card-head">
                  <div>
                    <div className="card-title">Recent transactions</div>
                    <div className="card-subtitle">
                      {transactions.length === 0
                        ? 'No transactions yet'
                        : `Last ${Math.min(5, transactions.length)} activities`}
                    </div>
                  </div>
                </div>

                {transactions.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">📄</div>
                    <div className="empty-title">No transactions yet</div>
                    <div className="empty-subtitle">Add money or transfer to get started</div>
                  </div>
                ) : (
                  <div className="table transactions">
                    <div className="row header">
                      <div>Date</div>
                      <div>Description</div>
                      <div>Category</div>
                      <div className="right">Amount</div>
                      <div className="right">View</div>
                    </div>
                    {transactions.map((t) => (
                      <div key={t.id} className="row">
                        <div className="mono">{t.date}</div>
                        <div>{t.description}</div>
                        <div className="muted">{t.category}</div>
                        <div className={t.amount < 0 ? 'right negative' : 'right positive'}>
                          {formatMoney(t.amount)}
                        </div>
                        <div className="right">
                          <button className="secondary" type="button" onClick={() => openTransactionDetails(t)}>
                            View
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </section>
        ) : (
          <>
            <section className="hero">
              <div>
                <div className="hero-title">Overview</div>
                <div className="hero-subtitle">Your balances and recent activity</div>
              </div>
              <div className="hero-balance">
                <div className="muted">Total balance</div>
                <div className="balance">{formatMoney(totalBalance)}</div>
              </div>
            </section>

            <section className="grid">
              <div className="card" id="section-checking">
                <div className="card-head">
                  <div>
                    <div className="card-title">Checking</div>
                    <div className="card-subtitle">Everyday spending</div>
                  </div>
                  <div className="pill">••• 0214</div>
                </div>
                <div className="card-value">{formatMoney(checkingBalance)}</div>
                <div className="card-foot">
                  <button className="secondary" type="button" onClick={() => openModal('transfer')}>
                    Transfer
                  </button>
                  <button className="secondary" type="button" onClick={() => openModal('payBills')}>
                    Pay bills
                  </button>
                  <button className="secondary" type="button" onClick={() => openModal('editChecking')}>
                    Edit balance
                  </button>
                </div>
              </div>

              <div className="card" id="section-savings">
                <div className="card-head">
                  <div>
                    <div className="card-title">Savings</div>
                    <div className="card-subtitle">Emergency fund</div>
                  </div>
                  <div className="pill">••• 8841</div>
                </div>
                <div className="card-value">{formatMoney(savingsBalance)}</div>
                <div className="card-foot">
                  <button className="secondary" type="button" onClick={() => openModal('addMoney')}>
                    Add money
                  </button>
                  <button className="secondary" type="button" onClick={() => openModal('setGoal')}>
                    Set goal
                  </button>
                  <button className="secondary" type="button" onClick={() => openModal('editSavings')}>
                    Edit balance
                  </button>
                </div>
              </div>

              {data.savingsGoal ? (
                <div className="card" id="section-savings-goal">
                  <div className="card-head">
                    <div>
                      <div className="card-title">Savings goal</div>
                      <div className="card-subtitle">Target: {formatMoney(data.savingsGoal)}</div>
                    </div>
                    <div className="pill">{Math.min(100, Math.round((savingsBalance / data.savingsGoal) * 100))}%</div>
                  </div>
                  <div className="goal-bar">
                    <div
                      className="goal-fill"
                      style={{ width: `${Math.min(100, (savingsBalance / data.savingsGoal) * 100)}%` }}
                    />
                  </div>
                  <div className="goal-foot muted">
                    {formatMoney(savingsBalance)} of {formatMoney(data.savingsGoal)}
                  </div>
                </div>
              ) : (
                <div className="card" id="section-savings-goal">
                  <div className="card-head">
                    <div>
                      <div className="card-title">Savings goal</div>
                      <div className="card-subtitle">No goal set</div>
                    </div>
                  </div>
                </div>
              )}
            </section>

            <section className="grid grid-full">
              <div className="card card-wide" id="section-transactions">
                <div className="card-head">
                  <div>
                    <div className="card-title">Recent transactions</div>
                    <div className="card-subtitle">
                      {transactions.length === 0
                        ? 'No transactions yet'
                        : `Last ${Math.min(5, transactions.length)} activities`}
                    </div>
                  </div>
                </div>

                {transactions.length === 0 ? (
                  <div className="empty-state">
                    <div className="empty-icon">📄</div>
                    <div className="empty-title">No transactions yet</div>
                    <div className="empty-subtitle">Add money or transfer to get started</div>
                  </div>
                ) : (
                  <div className="table transactions">
                    <div className="row header">
                      <div>Date</div>
                      <div>Description</div>
                      <div>Category</div>
                      <div className="right">Amount</div>
                      <div className="right">View</div>
                    </div>
                    {transactions.map((t) => (
                      <div key={t.id} className="row">
                        <div className="mono">{t.date}</div>
                        <div>{t.description}</div>
                        <div className="muted">{t.category}</div>
                        <div className={t.amount < 0 ? 'right negative' : 'right positive'}>
                          {formatMoney(t.amount)}
                        </div>
                        <div className="right">
                          <button className="secondary" type="button" onClick={() => openTransactionDetails(t)}>
                            View
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </section>
          </>
        )}
      </main>

      <nav className="mobile-nav" aria-label="Quick navigation">
        <button
          className={mobilePage === 'recent' ? 'mobile-nav-btn active' : 'mobile-nav-btn'}
          type="button"
          onClick={() => onSelectMobilePage('recent')}
        >
          Recent
        </button>
        <button
          className={mobilePage === 'checking' ? 'mobile-nav-btn active' : 'mobile-nav-btn'}
          type="button"
          onClick={() => onSelectMobilePage('checking')}
        >
          Checking
        </button>
        <button
          className={mobilePage === 'savings' ? 'mobile-nav-btn active' : 'mobile-nav-btn'}
          type="button"
          onClick={() => onSelectMobilePage('savings')}
        >
          Savings
        </button>
        <button
          className={mobilePage === 'goals' ? 'mobile-nav-btn active' : 'mobile-nav-btn'}
          type="button"
          onClick={() => onSelectMobilePage('goals')}
        >
          Goals
        </button>
      </nav>

      {modal ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal">
            <div className="modal-head">
              <div className="modal-title">
                {modal === 'transfer'
                  ? 'Transfer'
                  : modal === 'payBills'
                    ? 'Pay bills'
                    : modal === 'addMoney'
                      ? 'Add money'
                      : modal === 'setGoal'
                        ? 'Set savings goal'
                        : modal === 'txDetails'
                          ? 'Transaction details'
                          : 'Set savings goal'}
              </div>
              <button className="ghost" type="button" onClick={closeModal}>
                Close
              </button>
            </div>

            {modal === 'transfer' ? (
              <div className="modal-body">
                <label className="field">
                  <span>Direction</span>
                  <select
                    value={transferDirection}
                    onChange={(e) =>
                      setTransferDirection(e.target.value as 'checkingToSavings' | 'savingsToChecking')
                    }
                  >
                    <option value="checkingToSavings">Checking → Savings</option>
                    <option value="savingsToChecking">Savings → Checking</option>
                  </select>
                </label>
                <label className="field">
                  <span>Amount</span>
                  <input value={amountInput} onChange={(e) => setAmountInput(e.target.value)} placeholder="100" />
                </label>
                {modalError ? <div className="auth-error">{modalError}</div> : null}
                <div className="modal-actions">
                  <button className="primary" type="button" onClick={onConfirmTransfer}>
                    Confirm transfer
                  </button>
                </div>
              </div>
            ) : null}

            {modal === 'payBills' ? (
              <div className="modal-body">
                <label className="field">
                  <span>Bill name</span>
                  <input
                    value={descriptionInput}
                    onChange={(e) => setDescriptionInput(e.target.value)}
                    placeholder="Electricity"
                  />
                </label>
                <label className="field">
                  <span>Amount</span>
                  <input value={amountInput} onChange={(e) => setAmountInput(e.target.value)} placeholder="50" />
                </label>
                {modalError ? <div className="auth-error">{modalError}</div> : null}
                <div className="modal-actions">
                  <button className="primary" type="button" onClick={onConfirmPayBills}>
                    Pay now
                  </button>
                </div>
              </div>
            ) : null}

            {modal === 'addMoney' ? (
              <div className="modal-body">
                <label className="field">
                  <span>Amount</span>
                  <input value={amountInput} onChange={(e) => setAmountInput(e.target.value)} placeholder="200" />
                </label>
                {modalError ? <div className="auth-error">{modalError}</div> : null}
                <div className="modal-actions">
                  <button className="primary" type="button" onClick={onConfirmAddMoney}>
                    Add to savings
                  </button>
                </div>
              </div>
            ) : null}

            {modal === 'setGoal' ? (
              <div className="modal-body">
                <label className="field">
                  <span>Goal amount</span>
                  <input value={amountInput} onChange={(e) => setAmountInput(e.target.value)} placeholder="10000" />
                </label>
                {modalError ? <div className="auth-error">{modalError}</div> : null}
                <div className="modal-actions">
                  <button className="primary" type="button" onClick={onConfirmSetGoal}>
                    Save goal
                  </button>
                </div>
              </div>
            ) : null}

            {modal === 'editChecking' ? (
              <div className="modal-body">
                <label className="field">
                  <span>New checking balance</span>
                  <input value={amountInput} onChange={(e) => setAmountInput(e.target.value)} placeholder="0.00" />
                </label>
                {modalError ? <div className="auth-error">{modalError}</div> : null}
                <div className="modal-actions">
                  <button className="primary" type="button" onClick={onConfirmEditChecking}>
                    Update balance
                  </button>
                </div>
              </div>
            ) : null}

            {modal === 'editSavings' ? (
              <div className="modal-body">
                <label className="field">
                  <span>New savings balance</span>
                  <input value={amountInput} onChange={(e) => setAmountInput(e.target.value)} placeholder="0.00" />
                </label>
                {modalError ? <div className="auth-error">{modalError}</div> : null}
                <div className="modal-actions">
                  <button className="primary" type="button" onClick={onConfirmEditSavings}>
                    Update balance
                  </button>
                </div>
              </div>
            ) : null}

            {modal === 'settings' ? (
              <div className="modal-body">
                <div className="settings-section">
                  <div className="card-title">Data management</div>
                  <div className="settings-list">
                    <button className="secondary" type="button" onClick={onExportData}>
                      Export data (JSON)
                    </button>
                    <button className="secondary" type="button" onClick={onClearAllData}>
                      Clear all data
                    </button>
                  </div>
                </div>
                <div className="settings-section">
                  <div className="card-title">About</div>
                  <div className="muted" style={{ fontSize: 13, lineHeight: 1.5 }}>
                    My Personal Bank – v1.0.0<br />
                    A local-only banking demo.<br />
                    Data is stored in your browser.
                  </div>
                </div>
              </div>
            ) : null}

            {modal === 'txDetails' && selectedTransaction ? (
              <div className="modal-body">
                <div className="settings-section">
                  <div className="card-title">Details</div>
                  <div className="muted" style={{ fontSize: 13, lineHeight: 1.7 }}>
                    <div>
                      <span className="mono">{selectedTransaction.date}</span>
                    </div>
                    <div>{selectedTransaction.description}</div>
                    <div>Category: {selectedTransaction.category}</div>
                    <div>
                      Amount:{' '}
                      <span className={selectedTransaction.amount < 0 ? 'negative' : 'positive'}>
                        {formatMoney(selectedTransaction.amount)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  )
}

export default App
