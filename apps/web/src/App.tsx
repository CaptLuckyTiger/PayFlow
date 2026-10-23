import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import {
  ApiError,
  clearSession,
  createAccount,
  createPayment,
  getApiDocsUrl,
  getPayment,
  getSession,
  getUserProfile,
  listAccounts,
  listPayments,
  login,
  register,
  setSession,
  type Account,
  type Payment,
  type User,
} from './api';
import './App.css';

type AuthMode = 'login' | 'register';
type PaymentFilter = 'all' | Payment['status'];

const paymentStatuses: PaymentFilter[] = [
  'all',
  'APPROVED',
  'PENDING',
  'PROCESSING',
  'REJECTED',
  'FAILED',
  'TIMEOUT',
  'CANCELLED',
];

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [filter, setFilter] = useState<PaymentFilter>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(() => Boolean(getSession()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [currency, setCurrency] = useState('BRL');
  const [accountId, setAccountId] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [page, setPage] = useState(1);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const pageSize = 8;

  const loadDashboard = useCallback(async (): Promise<boolean> => {
    const session = getSession();
    if (!session) return false;

    try {
      const [profile, paymentList, accountList] = await Promise.all([getUserProfile(), listPayments(), listAccounts()]);
      setUser(profile);
      setPayments(paymentList);
      setAccounts(accountList);
      setAccountId((current) => current || accountList.find((account) => account.status === 'ACTIVE')?.id || '');
      setError('');
      return true;
    } catch (loadError) {
      if (loadError instanceof ApiError && loadError.status === 401) {
        clearSession();
        setUser(null);
        setPayments([]);
        setAccounts([]);
        setAccountId('');
      }
      setError(getErrorMessage(loadError, 'Não foi possível carregar seus dados.'));
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  const filteredPayments = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase();
    return payments.filter((payment) => {
      const matchesStatus = filter === 'all' || payment.status === filter;
      const matchesSearch =
        !normalizedSearch ||
        payment.description.toLocaleLowerCase().includes(normalizedSearch) ||
        payment.id.toLocaleLowerCase().includes(normalizedSearch);
      return matchesStatus && matchesSearch;
    });
  }, [filter, payments, search]);

  const approvedPayments = useMemo(() => payments.filter((payment) => payment.status === 'APPROVED'), [payments]);
  const approvedVolume = useMemo(() => sumByCurrency(approvedPayments), [approvedPayments]);
  const volumeSummary = approvedVolume.length
    ? approvedVolume.map(([currency, amount]) => formatMoney(amount, currency)).join(' · ')
    : '—';
  const activity = useMemo(() => buildActivity(payments), [payments]);
  const pageCount = Math.max(1, Math.ceil(filteredPayments.length / pageSize));
  const pagePayments = filteredPayments.slice((page - 1) * pageSize, page * pageSize);

  useEffect(() => setPage(1), [filter, search]);

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      const result = authMode === 'login' ? await login(email, password) : await register(email, password);
      setSession(result);
      setUser(result.user);
      setFilter('all');
      setSearch('');
      setPassword('');
      setLoading(true);
      await loadDashboard();
    } catch (authError) {
      setError(
        getErrorMessage(
          authError,
          authMode === 'login'
            ? 'Não foi possível entrar. Verifique seus dados e tente novamente.'
            : 'Não foi possível criar sua conta.',
        ),
      );
    } finally {
      setSubmitting(false);
      setLoading(false);
    }
  }

  function handleLogout() {
    clearSession();
    setUser(null);
    setPayments([]);
    setAccounts([]);
    setError('');
    setNotice('');
  }

  async function handleRefresh() {
    setLoading(true);
    setNotice('');
    if (await loadDashboard()) setNotice('Dados atualizados.');
  }

  if (loading && !user && getSession()) {
    return <LoadingScreen />;
  }

  if (!user) {
    return (
      <AuthScreen
        mode={authMode}
        email={email}
        password={password}
        error={error}
        submitting={submitting}
        onEmailChange={setEmail}
        onPasswordChange={setPassword}
        onSubmit={handleAuthSubmit}
        onModeChange={(mode) => {
          setAuthMode(mode);
          setError('');
        }}
      />
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#" aria-label="PayFlow início">
          <span className="brand-mark">P</span>
          <span>payflow</span>
        </a>

        <p className="sidebar-label">WORKSPACE</p>
        <nav className="main-nav" aria-label="Navegação principal">
          <a className="nav-link active" href="#overview">
            <NavIcon name="overview" />
            Visão geral
          </a>
          <a className="nav-link" href="#payments">
            <NavIcon name="payments" />
            Pagamentos
            <span className="nav-count">{payments.length}</span>
          </a>
        </nav>

        <div className="sidebar-bottom">
          <div className="sidebar-help">
            <span className="help-icon">?</span>
            <div>
              <strong>Precisa de ajuda?</strong>
              <span>Consulte a documentação da API.</span>
            </div>
            <a href={getApiDocsUrl()} target="_blank" rel="noreferrer" aria-label="Abrir documentação">
              ↗
            </a>
          </div>
          <div className="user-card">
            <span className="avatar">{getInitials(user.email)}</span>
            <span className="user-details">
              <strong>{user.email.split('@')[0]}</strong>
              <span>{user.email}</span>
            </span>
            <button className="icon-button logout-button" type="button" onClick={handleLogout} title="Sair">
              <NavIcon name="logout" />
            </button>
          </div>
        </div>
      </aside>

      <section className="main-content">
        <header className="topbar">
          <div className="breadcrumb">
            <span>Workspace</span>
            <span className="breadcrumb-divider">/</span>
            <strong>Visão geral</strong>
          </div>
          <div className="topbar-actions">
            <span className="environment-pill">
              <span /> Ambiente de simulação
            </span>
          </div>
        </header>

        <div className="page-content" id="overview">
          <div className="page-heading">
            <div>
              <p className="eyebrow">SEU ESPAÇO FINANCEIRO</p>
              <h1>Visão geral</h1>
              <p className="page-subtitle">Acompanhe seus pagamentos e a atividade da sua conta.</p>
            </div>
            <button
              className="button button-secondary refresh-button"
              onClick={() => void handleRefresh()}
              type="button"
            >
              <NavIcon name="refresh" />
              Atualizar dados
            </button>
          </div>

          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}
          {notice && (
            <div className="alert alert-success" role="status">
              {notice}
            </div>
          )}

          <section className="panel account-panel">
            <div className="panel-heading">
              <div>
                <h2>Contas</h2>
                <p>Contas simuladas usadas para receber pagamentos.</p>
              </div>
              <form
                className="account-create"
                onSubmit={async (event) => {
                  event.preventDefault();
                  setActionBusy(true);
                  setError('');
                  try {
                    const created = await createAccount(currency);
                    setAccounts((items) => [created, ...items]);
                    setAccountId(created.id);
                    setNotice(`Conta ${created.currency} criada.`);
                  } catch (cause) {
                    setError(getErrorMessage(cause, 'Não foi possível criar a conta.'));
                  } finally {
                    setActionBusy(false);
                  }
                }}
              >
                <select aria-label="Moeda da nova conta" value={currency} onChange={(event) => setCurrency(event.target.value)}>
                  <option>BRL</option>
                  <option>USD</option>
                  <option>EUR</option>
                </select>
                <button className="button button-secondary" disabled={actionBusy} type="submit">
                  + Nova conta
                </button>
              </form>
            </div>
            {accounts.length ? (
              <div className="account-list">
                {accounts.map((account) => (
                  <button
                    className={`account-chip${accountId === account.id ? ' chosen' : ''}`}
                    key={account.id}
                    onClick={() => setAccountId(account.id)}
                    type="button"
                  >
                    <strong>{account.currency}</strong>
                    <span>{account.status === 'ACTIVE' ? 'Ativa' : account.status}</span>
                    <small>{account.id.slice(-8)}</small>
                  </button>
                ))}
              </div>
            ) : (
              <p className="account-empty">Crie uma conta para começar a simular pagamentos.</p>
            )}
          </section>

          <section className="metric-grid" aria-label="Resumo da conta">
            <MetricCard
              label="Volume aprovado"
              value={volumeSummary}
              note={`${approvedPayments.length} pagamentos aprovados`}
              icon="money"
              accent="green"
            />
            <MetricCard
              label="Total de pagamentos"
              value={String(payments.length)}
              note="desde o início da conta"
              icon="payments"
              accent="purple"
            />
            <MetricCard
              label="Aguardando processamento"
              value={String(payments.filter((payment) => ['PENDING', 'PROCESSING'].includes(payment.status)).length)}
              note="pendentes ou em processamento"
              icon="clock"
              accent="amber"
            />
            <MetricCard
              label="Taxa de aprovação"
              value={payments.length ? `${Math.round((approvedPayments.length / payments.length) * 100)}%` : '—'}
              note={payments.length ? 'sobre todos os pagamentos' : 'sem pagamentos no período'}
              icon="check"
              accent="blue"
            />
          </section>

          <section className="overview-grid">
            <div className="panel activity-panel">
              <div className="panel-heading">
                <div>
                  <h2>Atividade recente</h2>
                  <p>Pagamentos criados nos últimos 7 dias</p>
                </div>
                <span className="period-chip">7 dias</span>
              </div>
              <ActivityChart data={activity} />
            </div>

            <div className="panel status-panel">
              <div className="panel-heading">
                <div>
                  <h2>Status dos pagamentos</h2>
                  <p>Distribuição de todos os pagamentos</p>
                </div>
              </div>
              <StatusBreakdown payments={payments} />
            </div>
          </section>

          <section className="panel payments-panel" id="payments">
            <div className="panel-heading payments-heading">
              <div>
                <h2>Pagamentos</h2>
                <p>Consulte e filtre as transações da sua conta.</p>
              </div>
              <div className="table-actions">
                <form
                  className="payment-create"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    const account = accounts.find((item) => item.id === accountId);
                    if (!account || account.status !== 'ACTIVE') {
                      setError('Crie ou selecione uma conta ativa antes de continuar.');
                      return;
                    }
                    setActionBusy(true);
                    setError('');
                    try {
                      const created = await createPayment({
                        accountId,
                        amountMinor: Math.round(Number(amount) * 100),
                        currency: account.currency,
                        description,
                        idempotencyKey: crypto.randomUUID(),
                      });
                      setPayments((items) => [created, ...items]);
                      setAmount('');
                      setDescription('');
                      setNotice('Pagamento enviado para simulação.');
                    } catch (cause) {
                      setError(getErrorMessage(cause, 'Não foi possível criar o pagamento.'));
                    } finally {
                      setActionBusy(false);
                    }
                  }}
                >
                  <input aria-label="Descrição do pagamento" minLength={3} onChange={(event) => setDescription(event.target.value)} placeholder="Descrição" required value={description} />
                  <input aria-label="Valor do pagamento" min="0.01" onChange={(event) => setAmount(event.target.value)} placeholder="Valor" required step="0.01" type="number" value={amount} />
                  <button
                    className="button button-primary"
                    disabled={actionBusy || !accounts.some((item) => item.id === accountId && item.status === 'ACTIVE')}
                    type="submit"
                  >
                    Criar pagamento
                  </button>
                </form>
                <label className="search-field">
                  <NavIcon name="search" />
                  <input
                    aria-label="Buscar pagamentos"
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Buscar pagamento..."
                    value={search}
                  />
                </label>
              </div>
            </div>
            <div className="filter-tabs" role="group" aria-label="Filtrar por status">
              {paymentStatuses.map((status) => (
                <button
                  aria-pressed={filter === status}
                  className={`filter-tab${filter === status ? ' selected' : ''}`}
                  key={status}
                  onClick={() => setFilter(status)}
                  type="button"
                >
                  {status === 'all' ? 'Todos' : translateStatus(status)}
                  <span>
                    {status === 'all'
                      ? payments.length
                      : payments.filter((payment) => payment.status === status).length}
                  </span>
                </button>
              ))}
            </div>
            <PaymentsTable
              payments={pagePayments}
              onSelect={async (payment) => {
                setSelectedPayment(payment);
                setDetailLoading(true);
                try {
                  setSelectedPayment(await getPayment(payment.id));
                } catch (cause) {
                  setError(getErrorMessage(cause, 'Não foi possível carregar o pagamento.'));
                } finally {
                  setDetailLoading(false);
                }
              }}
            />
            {filteredPayments.length > 0 && (
              <div className="pagination">
                <span>
                  {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, filteredPayments.length)} de {filteredPayments.length}
                </span>
                <button className="button button-secondary" disabled={page === 1} onClick={() => setPage((value) => value - 1)} type="button">
                  Anterior
                </button>
                <span>
                  Página {page} de {pageCount}
                </span>
                <button className="button button-secondary" disabled={page === pageCount} onClick={() => setPage((value) => value + 1)} type="button">
                  Próxima
                </button>
              </div>
            )}
          </section>

          <footer className="page-footer">
            <span>
              PayFlow <span className="footer-dot">·</span> Ambiente de simulação
            </span>
            <span>Dados protegidos por autenticação</span>
          </footer>
        </div>
      </section>
      {selectedPayment && (
        <div className="modal-backdrop" onClick={() => setSelectedPayment(null)} role="presentation">
          <section
            aria-labelledby="payment-detail-title"
            aria-modal="true"
            className="detail-modal"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
          >
            <button aria-label="Fechar detalhes" className="modal-close" onClick={() => setSelectedPayment(null)} type="button">
              ×
            </button>
            <p className="eyebrow">DETALHES DO PAGAMENTO</p>
            <h2 id="payment-detail-title">{selectedPayment.description}</h2>
            {detailLoading && <p>Atualizando detalhes...</p>}
            <dl>
              <dt>Status</dt><dd>{translateStatus(selectedPayment.status)}</dd>
              <dt>Valor</dt><dd>{formatMoney(selectedPayment.amountMinor, selectedPayment.currency)}</dd>
              <dt>ID</dt><dd>{selectedPayment.id}</dd>
              <dt>Referência</dt><dd>{selectedPayment.providerReference || '—'}</dd>
              <dt>Criado em</dt><dd>{formatDate(selectedPayment.createdAt)}</dd>
              <dt>Atualizado em</dt><dd>{formatDate(selectedPayment.updatedAt)}</dd>
            </dl>
          </section>
        </div>
      )}
    </main>
  );
}

function AuthScreen({
  mode,
  email,
  password,
  error,
  submitting,
  onEmailChange,
  onPasswordChange,
  onSubmit,
  onModeChange,
}: {
  mode: AuthMode;
  email: string;
  password: string;
  error: string;
  submitting: boolean;
  onEmailChange: (value: string) => void;
  onPasswordChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onModeChange: (mode: AuthMode) => void;
}) {
  return (
    <main className="auth-screen">
      <section className="auth-card">
        <a className="brand auth-brand" href="#" aria-label="PayFlow">
          <span className="brand-mark">P</span>
          <span>payflow</span>
        </a>
        <p className="eyebrow">PAGAMENTOS, COM CLAREZA</p>
        <h1>{mode === 'login' ? 'Boas-vindas de volta' : 'Crie sua conta'}</h1>
        <p className="auth-subtitle">
          {mode === 'login' ? 'Entre para acompanhar seus pagamentos.' : 'Cadastre-se para acessar seu espaço PayFlow.'}
        </p>
        <div className="auth-mode-switch" role="tablist" aria-label="Acesso">
          <button
            aria-selected={mode === 'login'}
            className={mode === 'login' ? 'selected' : ''}
            onClick={() => onModeChange('login')}
            role="tab"
            type="button"
          >
            Entrar
          </button>
          <button
            aria-selected={mode === 'register'}
            className={mode === 'register' ? 'selected' : ''}
            onClick={() => onModeChange('register')}
            role="tab"
            type="button"
          >
            Criar conta
          </button>
        </div>
        <form className="auth-form" onSubmit={onSubmit}>
          <label>
            E-mail
            <input
              autoComplete="email"
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="voce@empresa.com"
              required
              type="email"
              value={email}
            />
          </label>
          <label>
            Senha
            <input
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              minLength={8}
              onChange={(event) => onPasswordChange(event.target.value)}
              placeholder="Mínimo de 8 caracteres"
              required
              type="password"
              value={password}
            />
          </label>
          {error && (
            <div className="alert alert-error" role="alert">
              {error}
            </div>
          )}
          <button className="button button-primary auth-submit" disabled={submitting} type="submit">
            {submitting ? 'Aguarde...' : mode === 'login' ? 'Entrar na conta' : 'Criar minha conta'}
            {!submitting && <span>→</span>}
          </button>
        </form>
        <p className="auth-footnote">
          <span className="security-icon">✓</span> Sessão autenticada PayFlow
        </p>
      </section>
      <div className="auth-decoration">
        <div className="decoration-orbit orbit-one" />
        <div className="decoration-orbit orbit-two" />
        <div className="decoration-orbit orbit-three" />
        <div className="decoration-center">
          <span className="brand-mark">P</span>
          <strong>Pagamentos em movimento.</strong>
          <span>Simples de acompanhar. Confiáveis por natureza.</span>
        </div>
        <span className="auth-decoration-caption">PAYFLOW · FINANCIAL WORKSPACE</span>
      </div>
    </main>
  );
}

function MetricCard({
  label,
  value,
  note,
  icon,
  accent,
}: {
  label: string;
  value: string;
  note: string;
  icon: string;
  accent: string;
}) {
  return (
    <article className="metric-card">
      <div className="metric-top">
        <span>{label}</span>
        <span className={`metric-icon ${accent}`}>
          <NavIcon name={icon} />
        </span>
      </div>
      <strong className="metric-value">{value}</strong>
      <span className="metric-note">{note}</span>
    </article>
  );
}

function ActivityChart({ data }: { data: { label: string; count: number }[] }) {
  const maxCount = Math.max(...data.map((day) => day.count), 1);
  const points = data.map((day, index) => {
    const x = data.length > 1 ? 12 + (index / (data.length - 1)) * 376 : 200;
    const y = 120 - (day.count / maxCount) * 86;
    return `${x},${y}`;
  });

  return (
    <div className="activity-chart" aria-label="Gráfico de quantidade de pagamentos criados nos últimos 7 dias">
      <div className="chart-y-labels" aria-hidden="true">
        <span>{maxCount}</span>
        <span>{Math.ceil(maxCount / 2)}</span>
        <span>0</span>
      </div>
      <div className="chart-main">
        <svg className="chart-svg" viewBox="0 0 400 140" preserveAspectRatio="none" role="img">
          <title>Pagamentos criados por dia</title>
          <defs>
            <linearGradient id="chart-fill" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#5b5ce2" stopOpacity=".22" />
              <stop offset="100%" stopColor="#5b5ce2" stopOpacity="0" />
            </linearGradient>
          </defs>
          {[34, 77, 120].map((y) => (
            <line key={y} x1="0" x2="400" y1={y} y2={y} className="chart-gridline" />
          ))}
          <polygon points={`0,120 ${points.join(' ')} 400,120`} fill="url(#chart-fill)" />
          <polyline points={points.join(' ')} className="chart-line" />
          {data.map((day, index) => {
            const x = data.length > 1 ? 12 + (index / (data.length - 1)) * 376 : 200;
            const y = 120 - (day.count / maxCount) * 86;
            return (
              <circle key={day.label} cx={x} cy={y} r="3.5" className="chart-point">
                <title>{`${day.label}: ${day.count} pagamento(s)`}</title>
              </circle>
            );
          })}
        </svg>
        <div className="chart-x-labels">
          {data.map((day) => (
            <span key={day.label}>{day.label}</span>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusBreakdown({ payments }: { payments: Payment[] }) {
  const statuses = [
    { status: 'APPROVED', color: 'green' },
    { status: 'PENDING', color: 'amber' },
    { status: 'PROCESSING', color: 'blue' },
    { status: 'REJECTED', color: 'red' },
    { status: 'FAILED', color: 'red' },
    { status: 'TIMEOUT', color: 'gray' },
    { status: 'CANCELLED', color: 'gray' },
  ];
  const total = payments.length;

  if (!total) {
    return (
      <div className="status-breakdown status-empty">
        <div className="status-donut" style={{ '--approved': '0%' } as CSSProperties}>
          <div>
            <strong>0</strong>
            <span>total</span>
          </div>
        </div>
        <p className="empty-note">Os status aparecerão aqui quando houver pagamentos.</p>
      </div>
    );
  }

  return (
    <div className="status-breakdown">
      <div
        className="status-donut"
        style={
          {
            '--approved': `${total ? (payments.filter((payment) => payment.status === 'APPROVED').length / total) * 100 : 0}%`,
          } as CSSProperties
        }
      >
        <div>
          <strong>{total}</strong>
          <span>total</span>
        </div>
      </div>
      <div className="status-legend">
        {statuses.map(({ status, color }) => {
          const count = payments.filter((payment) => payment.status === status).length;
          if (!count) return null;
          return (
            <div className="legend-row" key={status}>
              <span className={`legend-dot ${color}`} />
              <span>{translateStatus(status)}</span>
              <strong>{count}</strong>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function PaymentsTable({ payments, onSelect }: { payments: Payment[]; onSelect: (payment: Payment) => void }) {
  if (!payments.length) {
    return (
      <div className="table-empty">
        <span className="empty-icon">
          <NavIcon name="payments" />
        </span>
        <strong>Nenhum pagamento encontrado</strong>
        <span>Quando houver movimentações, elas aparecerão nesta lista.</span>
      </div>
    );
  }

  return (
    <div className="table-scroll">
      <table>
        <thead>
          <tr>
            <th>Pagamento</th>
            <th>Status</th>
            <th>Valor</th>
            <th>Referência</th>
            <th>Data</th>
          </tr>
        </thead>
        <tbody>
          {payments.map((payment) => (
            <tr className="payment-row" key={payment.id} onClick={() => onSelect(payment)}>
              <td>
                <div className="payment-name">
                  <span className="payment-avatar">{payment.description.slice(0, 1).toLocaleUpperCase()}</span>
                  <span>
                  <strong>{payment.description}</strong>
                    <small>#{payment.id.slice(-8).toLocaleUpperCase()}</small>
                  </span>
                </div>
              </td>
              <td>
                <span className={`status-badge status-${payment.status.toLowerCase()}`}>
                  <i />
                  {translateStatus(payment.status)}
                </span>
              </td>
              <td className="amount-cell">{formatMoney(payment.amountMinor, payment.currency)}</td>
              <td className="reference-cell">{payment.providerReference || <span className="muted">—</span>}</td>
              <td className="date-cell">{formatDate(payment.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="table-footer">
        <strong>{payments.length}</strong> pagamento(s) exibido(s)
      </div>
    </div>
  );
}

function LoadingScreen() {
  return (
    <main className="loading-screen">
      <span className="brand-mark">P</span>
      <span className="loading-spinner" />
      Carregando seu workspace...
    </main>
  );
}

function NavIcon({ name }: { name: string }) {
  const common = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (name) {
    case 'overview':
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="3" y="3" width="5.5" height="6" rx="1.3" {...common} />
          <rect x="11.5" y="3" width="5.5" height="3.5" rx="1.1" {...common} />
          <rect x="11.5" y="8.5" width="5.5" height="8.5" rx="1.3" {...common} />
          <rect x="3" y="11" width="5.5" height="6" rx="1.3" {...common} />
        </svg>
      );
    case 'payments':
    case 'money':
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <rect x="2.5" y="4" width="15" height="12" rx="2.2" {...common} />
          <path d="M2.8 8h14.4M6 12h3" {...common} />
        </svg>
      );
    case 'clock':
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="7" {...common} />
          <path d="M10 6v4l2.5 1.5" {...common} />
        </svg>
      );
    case 'check':
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="7" {...common} />
          <path d="m7 10 2 2 4-4" {...common} />
        </svg>
      );
    case 'logout':
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M8 4H4.8A1.8 1.8 0 0 0 3 5.8v8.4A1.8 1.8 0 0 0 4.8 16H8m3-9 4 3-4 3m4-3H7" {...common} />
        </svg>
      );
    case 'bell':
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M5 8a5 5 0 0 1 10 0c0 5 2 5 2 6H3c0-1 2-1 2-6m3 8a2 2 0 0 0 4 0" {...common} />
        </svg>
      );
    case 'refresh':
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path
            d="M16.4 8A6.6 6.6 0 0 0 4.8 5.1L3 7m0-4v4h4m-3.4 5A6.6 6.6 0 0 0 15.2 14.9L17 13m0 4v-4h-4"
            {...common}
          />
        </svg>
      );
    case 'search':
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="8.8" cy="8.8" r="5.6" {...common} />
          <path d="m13 13 4 4" {...common} />
        </svg>
      );
    case 'filter':
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <path d="M3 5h14M5.5 10h9M8 15h4" {...common} />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 20 20" aria-hidden="true">
          <circle cx="10" cy="10" r="7" {...common} />
        </svg>
      );
  }
}

function translateStatus(status: string): string {
  const labels: Record<string, string> = {
    APPROVED: 'Aprovado',
    PENDING: 'Pendente',
    PROCESSING: 'Processando',
    REJECTED: 'Recusado',
    FAILED: 'Falhou',
    TIMEOUT: 'Expirado',
    CANCELLED: 'Cancelado',
  };
  return labels[status] ?? status;
}

function formatMoney(amountMinor: number, currency: string): string {
  try {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(amountMinor / 100);
  } catch {
    return `${currency} ${(amountMinor / 100).toFixed(2)}`;
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function sumByCurrency(payments: Payment[]): [string, number][] {
  const totals = new Map<string, number>();
  payments.forEach((payment) =>
    totals.set(payment.currency, (totals.get(payment.currency) ?? 0) + payment.amountMinor),
  );
  return [...totals.entries()];
}

function buildActivity(payments: Payment[]): { label: string; count: number }[] {
  const now = new Date();
  return Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now);
    day.setDate(now.getDate() - (6 - index));
    const dayKey = getDateKey(day);
    return {
      label: new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(day).replace('.', ''),
      count: payments.filter((payment) => getDateKey(new Date(payment.createdAt)) === dayKey).length,
    };
  });
}

function getDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function getInitials(email: string): string {
  return email.slice(0, 1).toLocaleUpperCase();
}

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError) return error.message || fallback;
  return fallback;
}

export default App;
